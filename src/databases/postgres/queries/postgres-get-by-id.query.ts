import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { buildSelectClause } from "../utils/build-select-clause.js";
import { transformJoinResults } from "../utils/transform-join-results.js";
import { BadRequestError } from '../../../errors/index.js';
import { IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { buildWhereClause } from '../utils/build-where-clause.js';

export async function getById<T>(
    client: Client,
    operations: Operation[],
    queryObject: IQueryOptions,
    id: AppIdType,
    pluralResourceName: string
): Promise<T | null> {
    if (!id)
        throw new BadRequestError('id is required');
    
    const joinClauses = buildJoinClauses(operations, pluralResourceName);
    
    // Build SELECT clause with explicit columns and JSON aggregation for joins
    // If no joins, use SELECT * for simplicity
    const hasJoins = operations.some(op => op instanceof Join || op instanceof JoinMany || op instanceof JoinThrough);
    const selectClause = hasJoins 
        ? await buildSelectClause(client, pluralResourceName, pluralResourceName, operations)
        : '*';

    queryObject.filters || (queryObject.filters = {});
    queryObject.filters._id = { eq: id };

    // When there are joins, qualify column names with table prefix to avoid ambiguity
    const tablePrefix = hasJoins ? pluralResourceName : undefined;
    const { whereClause, values } = buildWhereClause(queryObject, [], tablePrefix);
    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause} LIMIT 1`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    // Transform flat results into nested objects
    const transformed = transformJoinResults<T>([result.rows[0]], operations);
    return transformed[0] || null;
}


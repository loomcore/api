import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { buildSelectClause } from "../utils/build-select-clause.js";
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

    const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
    const joinClauses = hasJoins
        ? buildJoinClauses(operations, pluralResourceName, { oneToOneOnly: true })
        : buildJoinClauses(operations, pluralResourceName);

    const selectClause = hasJoins
        ? await buildSelectClause(client, pluralResourceName, operations)
        : '*';

    queryObject.filters || (queryObject.filters = {});
    queryObject.filters._id = { eq: id };

    const tablePrefix = hasJoins ? pluralResourceName : undefined;
    const { whereClause, values } = buildWhereClause(queryObject, [], tablePrefix);
    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause} LIMIT 1`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    if (hasJoins) {
        return (result.rows[0] as { entity: T }).entity;
    }
    return result.rows[0] as T;
}


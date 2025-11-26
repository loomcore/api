import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { buildSelectClause } from "../utils/build-select-clause.js";
import { transformJoinResults } from "../utils/transform-join-results.js";
import { BadRequestError } from '../../../errors/index.js';

export async function getById<T>(
    client: Client,
    operations: Operation[],
    id: string,
    pluralResourceName: string
): Promise<T | null> {
    if (!id)
        throw new BadRequestError('id is required');
    
    const joinClauses = buildJoinClauses(operations, pluralResourceName);
    
    // Build SELECT clause with explicit columns and JSON aggregation for joins
    // If no joins, use SELECT * for simplicity
    const hasJoins = operations.some(op => op instanceof Join);
    const selectClause = hasJoins 
        ? await buildSelectClause(client, pluralResourceName, pluralResourceName, operations)
        : '*';
    
    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} WHERE "${pluralResourceName}"."_id" = $1 LIMIT 1`;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
        return null;
    }

    // Transform flat results into nested objects
    const transformed = transformJoinResults<T>([result.rows[0]], operations);
    return transformed[0] || null;
}


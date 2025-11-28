import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { transformJoinResults } from '../utils/transform-join-results.js';

export async function getAll<T>(
    client: Client,
    operations: Operation[],
    pluralResourceName: string
): Promise<T[]> {
    const joinClauses = buildJoinClauses(operations, pluralResourceName);
    
    // Build SELECT clause with explicit columns and JSON aggregation for joins
    // If no joins, use SELECT * for simplicity
    const hasJoins = operations.some(op => op instanceof Join);
    const selectClause = hasJoins 
        ? await buildSelectClause(client, pluralResourceName, pluralResourceName, operations)
        : '*';
    
    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}`;
    
    const result = await client.query(query);
    
    // Transform flat results into nested objects
    return transformJoinResults<T>(result.rows, operations);
}


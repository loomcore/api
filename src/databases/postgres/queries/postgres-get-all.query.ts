import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
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
    const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
    const selectClause = hasJoins
        ? await buildSelectClause(client, pluralResourceName, operations)
        : '*';

    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}`;

    const result = await client.query(query);

    // Transform flat results into nested objects
    return transformJoinResults<T>(result.rows, operations);
}


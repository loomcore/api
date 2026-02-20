import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';

export async function getAll<T>(
    client: Client,
    operations: Operation[],
    pluralResourceName: string
): Promise<T[]> {
    const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
    const joinClauses = hasJoins
        ? buildJoinClauses(operations, pluralResourceName, { oneToOneOnly: true })
        : buildJoinClauses(operations, pluralResourceName);

    const selectClause = hasJoins
        ? await buildSelectClause(client, pluralResourceName, operations)
        : '*';

    const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}`;
    const result = await client.query(query);

    if (hasJoins) {
        return (result.rows as { entity: T }[]).map(r => r.entity);
    }
    return result.rows as T[];
}


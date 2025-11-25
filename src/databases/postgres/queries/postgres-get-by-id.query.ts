import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { BadRequestError } from '../../../errors/index.js';

export async function getById<T>(
    client: Client,
    operations: Operation[],
    id: string,
    pluralResourceName: string
): Promise<T | null> {
    if (!id)
        throw new BadRequestError('id is required');
    const joinClauses = buildJoinClauses(operations);
    
    const query = `SELECT * FROM "${pluralResourceName}" ${joinClauses} WHERE "_id" = $1 LIMIT 1`;
    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0] as T;
}


import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';

export async function getAll<T>(
    client: Client,
    operations: Operation[],
    pluralResourceName: string
): Promise<T[]> {
    const joinClauses = buildJoinClauses(operations);
    
    const query = `SELECT * FROM "${pluralResourceName}" ${joinClauses}`;
    
    const result = await client.query(query);
    
    return result.rows as T[];
}


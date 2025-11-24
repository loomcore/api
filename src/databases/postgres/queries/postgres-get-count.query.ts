import { Client } from 'pg';
import { executeCountQuery } from "../utils/build-count-query.js";

export async function getCount(
    client: Client,
    pluralResourceName: string
): Promise<number> {
    return executeCountQuery(client, pluralResourceName);
}


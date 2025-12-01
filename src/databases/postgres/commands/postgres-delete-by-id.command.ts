import { Client } from 'pg';
import { DeleteResult } from "../../models/delete-result.js";

export async function deleteById(
    client: Client,
    id: string,
    pluralResourceName: string
): Promise<DeleteResult> {
    const query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1`;
    const result = await client.query(query, [id]);
    
    return new DeleteResult(true, result.rowCount || 0);
}


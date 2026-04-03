import type { PostgresConnection } from '../postgres-connection.js';
import { DeleteResult } from "../../models/delete-result.js";
import type { AppIdType } from '@loomcore/common/types';

export async function deleteById(
    client: PostgresConnection,
    id: AppIdType,
    pluralResourceName: string
): Promise<DeleteResult> {
    const query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1`;
    const result = await client.query(query, [id]);
    
    return new DeleteResult(true, result.rowCount || 0);
}


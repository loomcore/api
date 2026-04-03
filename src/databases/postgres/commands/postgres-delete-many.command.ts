import type { PostgresConnection } from '../postgres-connection.js';
import { IQueryOptions } from "@loomcore/common/models";
import { buildWhereClause } from '../utils/build-where-clause.js';
import { DeleteResult } from "../../models/delete-result.js";

export async function deleteMany(
    client: PostgresConnection,
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<DeleteResult> {
    try {
        // Build WHERE clause from queryObject
        const { whereClause, values } = buildWhereClause(queryObject);

        const query = `DELETE FROM "${pluralResourceName}" ${whereClause}`;
        const result = await client.query(query, values);
        
        return new DeleteResult(true, result.rowCount || 0);
    } catch (error: any) {
        return new DeleteResult(false, 0);
    }
}


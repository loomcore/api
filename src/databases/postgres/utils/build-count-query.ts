import type { PostgresConnection } from '../postgres-connection.js';
import { IQueryOptions } from "@loomcore/common/models";
import { buildWhereClause } from "./build-where-clause.js";

export async function executeCountQuery(
    client: PostgresConnection,
    pluralResourceName: string,
    queryOptions: IQueryOptions = {}
): Promise<number> {
    const { whereClause, values } = buildWhereClause(queryOptions);
    
    const countQuery = `SELECT COUNT(*) as total FROM "${pluralResourceName}" ${whereClause}`;
    const countResult = await client.query(countQuery, values);
    
    return parseInt(countResult.rows[0].total, 10);
}


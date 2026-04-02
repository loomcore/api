import type { PostgresConnection } from '../postgres-connection.js';
import { IQueryOptions } from "@loomcore/common/models";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";

export async function findOne<T>(
    client: PostgresConnection,
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<T | null> {
    const { whereClause, values } = buildWhereClause(queryObject);

    const orderByClause = buildOrderByClause(queryObject);

    const query = `SELECT * FROM "${pluralResourceName}" ${whereClause} ${orderByClause} LIMIT 1`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    const row = result.rows[0];

    return row as T;
}


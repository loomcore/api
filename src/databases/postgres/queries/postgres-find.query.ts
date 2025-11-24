import { Client } from 'pg';
import { IQueryOptions } from "@loomcore/common/models";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";

export async function find<T>(
    client: Client,
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<T[]> {
    const { whereClause, values } = buildWhereClause(queryObject);
    const orderByClause = buildOrderByClause(queryObject);

    const query = `SELECT * FROM "${pluralResourceName}" ${whereClause} ${orderByClause}`.trim();
    const result = await client.query(query, values);

    return result.rows as T[];
}


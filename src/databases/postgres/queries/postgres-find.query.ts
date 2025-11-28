import { Client } from 'pg';
import { IQueryOptions } from "@loomcore/common/models";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";
import { buildPaginationClause } from '../utils/build-pagination-clause.js';

export async function find<T>(
    client: Client,
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<T[]> {
    const { whereClause, values } = buildWhereClause(queryObject);
    const orderByClause = buildOrderByClause(queryObject);
    const paginationClause = buildPaginationClause(queryObject);

    const query = `SELECT * FROM "${pluralResourceName}" ${whereClause} ${orderByClause} ${paginationClause}`.trim();
    const result = await client.query(query, values);

    return result.rows as T[];
}


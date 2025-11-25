import { Client } from 'pg';
import { IQueryOptions, IModelSpec, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { executeCountQuery } from "../utils/build-count-query.js";
import { apiUtils } from "../../../utils/api.utils.js";
import { buildPaginationClause } from '../utils/build-pagination-clause.js';

export async function get<T>(
    client: Client,
    operations: Operation[],
    queryOptions: IQueryOptions,
    pluralResourceName: string
): Promise<IPagedResult<T>> {
    const { whereClause, values } = buildWhereClause(queryOptions);
    const joinClauses = buildJoinClauses(operations);
    const orderByClause = buildOrderByClause(queryOptions);
    const paginationClause = buildPaginationClause(queryOptions);
    // Build the base query parts
    const baseQuery = `SELECT * FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;
    
    // Get total count
    const total = await executeCountQuery(client, pluralResourceName, queryOptions);

    // Execute the main query
    const dataQuery = `${baseQuery} ${orderByClause} ${paginationClause}`.trim();
    const dataResult = await client.query(dataQuery, values);
    
    const entities = dataResult.rows as T[];

    return apiUtils.getPagedResult<T>(entities, total, queryOptions);
}


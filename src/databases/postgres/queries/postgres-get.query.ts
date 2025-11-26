import { Client } from 'pg';
import { IQueryOptions, IModelSpec, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { buildSelectClause } from "../utils/build-select-clause.js";
import { transformJoinResults } from "../utils/transform-join-results.js";
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
    const joinClauses = buildJoinClauses(operations, pluralResourceName);
    const orderByClause = buildOrderByClause(queryOptions);
    const paginationClause = buildPaginationClause(queryOptions);
    
    // Build SELECT clause with explicit columns and JSON aggregation for joins
    // If no joins, use SELECT * for simplicity
    const hasJoins = operations.some(op => op instanceof Join);
    const selectClause = hasJoins 
        ? await buildSelectClause(client, pluralResourceName, pluralResourceName, operations)
        : '*';
    
    // Build the base query parts
    const baseQuery = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;
    
    // Get total count
    const total = await executeCountQuery(client, pluralResourceName, queryOptions);

    // Execute the main query
    const dataQuery = `${baseQuery} ${orderByClause} ${paginationClause}`.trim();
    const dataResult = await client.query(dataQuery, values);
    
    // Transform flat results into nested objects
    const entities = transformJoinResults<T>(dataResult.rows, operations);

    return apiUtils.getPagedResult<T>(entities, total, queryOptions);
}


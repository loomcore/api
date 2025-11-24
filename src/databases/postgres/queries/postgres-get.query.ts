import { Client } from 'pg';
import { IQueryOptions, IModelSpec, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import { buildWhereClause } from "../utils/build-where-clause.js";
import { buildOrderByClause } from "../utils/build-order-by-clause.js";
import { buildJoinClauses } from "../utils/build-join-clauses.js";
import { executeCountQuery } from "../utils/build-count-query.js";
import { apiUtils } from "../../../utils/api.utils.js";

export async function get<T>(
    client: Client,
    operations: Operation[],
    queryOptions: IQueryOptions,
    pluralResourceName: string
): Promise<IPagedResult<T>> {
    const { whereClause, values } = buildWhereClause(queryOptions);
    const joinClauses = buildJoinClauses(operations);
    const orderByClause = buildOrderByClause(queryOptions);

    // Build the base query parts
    const baseQuery = `SELECT * FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;
    
    // Get total count
    const total = await executeCountQuery(client, pluralResourceName, queryOptions);

    // Build pagination
    let limitOffsetClause = '';
    const limitValues = [...values];
    if (queryOptions.page && queryOptions.pageSize) {
        const offset = (queryOptions.page - 1) * queryOptions.pageSize;
        const limitParamIndex = limitValues.length + 1;
        const offsetParamIndex = limitValues.length + 2;
        limitOffsetClause = `LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;
        limitValues.push(queryOptions.pageSize, offset);
    }

    // Execute the main query
    const dataQuery = `${baseQuery} ${orderByClause} ${limitOffsetClause}`.trim();
    const dataResult = await client.query(dataQuery, limitValues);
    
    const entities = dataResult.rows as T[];

    return apiUtils.getPagedResult<T>(entities, total, queryOptions);
}


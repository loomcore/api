import type { PostgresConnection } from '../postgres-connection.js';
import { IQueryOptions, IModelSpec, IPagedResult } from '@loomcore/common/models';
import { Operation } from '../../operations/operation.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { buildOrderByClause } from '../utils/build-order-by-clause.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { executeCountQuery } from '../utils/build-count-query.js';
import { apiUtils } from '../../../utils/api.utils.js';
import { buildPaginationClause } from '../utils/build-pagination-clause.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';

export async function get<T>(
  client: PostgresConnection,
  operations: Operation[],
  queryOptions: IQueryOptions,
  pluralResourceName: string
): Promise<IPagedResult<T>> {
  const hasJoins = operations.some(isJoinOperation);
  const joinClauses = buildJoinClauses(operations, pluralResourceName);
  const orderByClause = buildOrderByClause(queryOptions, pluralResourceName);
  const paginationClause = buildPaginationClause(queryOptions);

  // Build SELECT clause: with joins, single jsonb entity column; otherwise *
  const selectClause = hasJoins
    ? await buildSelectClause(client, pluralResourceName, operations)
    : '*';

  const { whereClause, values } = buildWhereClause(queryOptions, pluralResourceName, [], operations);

  // Build the base query parts
  const baseQuery = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;

  // Get total count with the same joins and filters so total matches the page
  const total = await executeCountQuery(client, pluralResourceName, queryOptions, operations);

  // Execute the main query
  const dataQuery = `${baseQuery} ${orderByClause} ${paginationClause}`.trim();
  const dataResult = await client.query(dataQuery, values);

  const entities = hasJoins
    ? (dataResult.rows as { entity: T }[]).map(r => r.entity)
    : (dataResult.rows as T[]);

  return apiUtils.getPagedResult<T>(entities, total, queryOptions);
}


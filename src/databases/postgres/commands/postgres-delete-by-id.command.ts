import { IQueryOptions } from '@loomcore/common/models';
import type { PostgresConnection } from '../postgres-connection.js';
import { DeleteResult } from '../../models/delete-result.js';
import type { AppIdType } from '@loomcore/common/types';
import { buildWhereClause } from '../utils/build-where-clause.js';

export async function deleteById(
  client: PostgresConnection,
  queryOptions: IQueryOptions,
  id: AppIdType,
  pluralResourceName: string
): Promise<DeleteResult> {
  // Build combined WHERE clause with _id and any additional queryOptions filters (e.g., _orgId for tenant isolation)
  const combinedQueryOptions: IQueryOptions = {
    ...queryOptions,
    filters: {
      ...queryOptions.filters,
      _id: { eq: id },
    },
  };
  const { whereClause, values } = buildWhereClause(combinedQueryOptions, pluralResourceName);

  const query = `DELETE FROM "${pluralResourceName}" ${whereClause}`;
  const result = await client.query(query, values);

  return new DeleteResult(true, result.rowCount || 0);
}

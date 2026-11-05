import { IQueryOptions } from '@loomcore/common/models';
import type { PostgresConnection } from '../postgres-connection.js';
import { executeCountQuery } from '../utils/build-count-query.js';

export async function getCount(
  client: PostgresConnection,
  queryOptions: IQueryOptions,
  pluralResourceName: string
): Promise<number> {
  return executeCountQuery(client, pluralResourceName, queryOptions);
}


import type { PostgresConnection } from '../postgres-connection.js';
import { IQueryOptions } from '@loomcore/common/models';
import type { Operation } from '../../operations/operation.js';
import { buildJoinClauses } from './build-join-clauses.js';
import { buildWhereClause } from './build-where-clause.js';

export function buildCountQuerySql(
  pluralResourceName: string,
  queryOptions: IQueryOptions = {},
  operations: Operation[] = [],
): { countQuery: string; values: any[] } {
  const joinClauses = operations.length > 0
    ? buildJoinClauses(operations, pluralResourceName, { oneToOneOnly: true })
    : '';
  const tablePrefix = joinClauses ? pluralResourceName : undefined;
  const { whereClause, values } = buildWhereClause(
    queryOptions,
    [],
    tablePrefix,
    operations.length > 0 ? operations : undefined,
    pluralResourceName,
  );
  const countQuery = ['SELECT COUNT(*) as total', `FROM "${pluralResourceName}"`, joinClauses, whereClause]
    .filter(part => part.trim().length > 0)
    .join(' ');
  return { countQuery, values };
}

export async function executeCountQuery(
  client: PostgresConnection,
  pluralResourceName: string,
  queryOptions: IQueryOptions = {},
  operations: Operation[] = [],
): Promise<number> {
  const { countQuery, values } = buildCountQuerySql(pluralResourceName, queryOptions, operations);
  const countResult = await client.query(countQuery, values);

  return parseInt(countResult.rows[0].total, 10);
}

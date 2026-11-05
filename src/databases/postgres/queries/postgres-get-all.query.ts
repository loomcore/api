import { IQueryOptions } from '@loomcore/common/models';
import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { buildWhereClause } from '../utils/build-where-clause.js';

export async function getAll<T>(
  client: PostgresConnection,
  operations: Operation[],
  queryOptions: IQueryOptions,
  pluralResourceName: string
): Promise<T[]> {
  const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
  const joinClauses = buildJoinClauses(operations, pluralResourceName);

  const selectClause = hasJoins
    ? await buildSelectClause(client, pluralResourceName, operations)
    : '*';

  const { whereClause, values } = buildWhereClause(queryOptions, pluralResourceName, [], operations);

  const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;
  const result = await client.query(query, values);

  if (hasJoins) {
    return (result.rows as { entity: T }[]).map(r => r.entity);
  }
  return result.rows as T[];
}

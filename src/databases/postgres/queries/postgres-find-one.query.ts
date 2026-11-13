import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';
import type { Filters } from '../../../services/filters.type.js';

export async function findOne<T>(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
  operations: Operation[] = [],
): Promise<T | null> {
  const hasJoins = operations.some(isJoinOperation);
  const joinClauses = buildJoinClauses(operations, pluralResourceName);

  const selectClause = hasJoins
    ? await buildSelectClause(client, pluralResourceName, operations)
    : '*';

  const { whereClause, values } = buildWhereClause({ filters }, pluralResourceName, [], operations);
  const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause} LIMIT 1`;
  const result = await client.query(query, values);

  if (result.rows.length === 0) {
    return null;
  }

  if (hasJoins) {
    return (result.rows[0] as { entity: T }).entity;
  }
  return result.rows[0] as T;
}

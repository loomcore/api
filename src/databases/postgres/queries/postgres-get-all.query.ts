import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';
import type { Filters } from '../../../services/filters.type.js';

export async function getAll<T>(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
  operations: Operation[],
): Promise<T[]> {
  const hasJoins = operations.some(isJoinOperation);
  const joinClauses = buildJoinClauses(operations, pluralResourceName);

  const selectClause = hasJoins
    ? await buildSelectClause(client, pluralResourceName, operations)
    : '*';

  const { whereClause, values } = buildWhereClause({ filters }, pluralResourceName, [], operations);

  const query = `SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses} ${whereClause}`;
  const result = await client.query(query, values);

  if (hasJoins) {
    return (result.rows as { entity: T }[]).map(r => r.entity);
  }
  return result.rows as T[];
}

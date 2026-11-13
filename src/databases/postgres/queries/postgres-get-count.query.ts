import type { PostgresConnection } from '../postgres-connection.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import type { Filters } from '../../../services/filters.type.js';

export async function getCount(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
): Promise<number> {
  const { whereClause, values } = buildWhereClause({ filters }, pluralResourceName);

  const query = `SELECT COUNT(*) FROM "${pluralResourceName}" ${whereClause}`;
  const result = await client.query(query, values);
  return parseInt(result.rows[0].count, 10);
}

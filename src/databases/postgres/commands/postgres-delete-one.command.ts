import type { PostgresConnection } from '../postgres-connection.js';
import { DeleteResult } from '../../models/delete-result.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import type { Filters } from '../../../services/filters.type.js';

export async function deleteOne(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
): Promise<DeleteResult> {
  const { whereClause, values } = buildWhereClause({ filters }, pluralResourceName);

  const query = `DELETE FROM "${pluralResourceName}" ${whereClause}`;
  const result = await client.query(query, values);

  return new DeleteResult(true, result.rowCount || 0);
}

import type { PostgresConnection } from '../postgres-connection.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { DeleteResult } from '../../models/delete-result.js';
import type { Filters } from '../../../services/filters.type.js';

export async function deleteMany(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
): Promise<DeleteResult> {
  try {
    const { whereClause, values } = buildWhereClause({ filters }, pluralResourceName);

    const query = `DELETE FROM "${pluralResourceName}" ${whereClause}`;
    const result = await client.query(query, values);

    return new DeleteResult(true, result.rowCount || 0);
  } catch (error: any) {
    return new DeleteResult(false, 0);
  }
}

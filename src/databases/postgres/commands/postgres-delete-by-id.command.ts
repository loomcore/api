import type { PostgresConnection } from '../postgres-connection.js';
import { DeleteResult } from '../../models/delete-result.js';
import type { AppIdType } from '@loomcore/common/types';

export async function deleteById(client: PostgresConnection, id: AppIdType, pluralResourceName: string, orgId?: AppIdType): Promise<DeleteResult> {
  let query: string;
  let values: AppIdType[];

  if (orgId !== undefined) {
    query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1 AND "_orgId" = $2`;
    values = [id, orgId];
  } else {
    query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1`;
    values = [id];
  }

  const result = await client.query(query, values);

  return new DeleteResult(true, result.rowCount || 0);
}

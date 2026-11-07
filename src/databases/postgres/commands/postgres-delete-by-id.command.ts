import type { PostgresConnection } from '../postgres-connection.js';
import { DeleteResult } from '../../models/delete-result.js';
import type { AppIdType } from '@loomcore/common/types';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function deleteById(
  client: PostgresConnection,
  id: AppIdType,
  pluralResourceName: string
): Promise<DeleteResult> {
  // Check for tenant isolation from AsyncLocalStorage context
  const tenantOrgId = getTenantOrgId();

  let query: string;
  let values: (AppIdType)[];

  if (tenantOrgId !== undefined) {
    query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1 AND "_orgId" = $2`;
    values = [id, tenantOrgId];
  } else {
    query = `DELETE FROM "${pluralResourceName}" WHERE "_id" = $1`;
    values = [id];
  }

  const result = await client.query(query, values);

  return new DeleteResult(true, result.rowCount || 0);
}

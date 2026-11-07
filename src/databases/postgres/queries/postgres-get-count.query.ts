import type { PostgresConnection } from '../postgres-connection.js';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function getCount(
  client: PostgresConnection,
  pluralResourceName: string
): Promise<number> {
  // Check for tenant isolation from AsyncLocalStorage context
  const tenantOrgId = getTenantOrgId();

  let query: string;
  let values: unknown[];

  if (tenantOrgId !== undefined) {
    query = `SELECT COUNT(*) FROM "${pluralResourceName}" WHERE "_orgId" = $1`;
    values = [tenantOrgId];
  } else {
    query = `SELECT COUNT(*) FROM "${pluralResourceName}"`;
    values = [];
  }

  const result = await client.query(query, values);
  return parseInt(result.rows[0].count, 10);
}

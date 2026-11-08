import type { PostgresConnection } from '../postgres-connection.js';
import type { AppIdType } from '@loomcore/common/types';

export async function getCount(client: PostgresConnection, pluralResourceName: string, orgId?: AppIdType): Promise<number> {
  let query: string;
  let values: unknown[];

  if (orgId !== undefined) {
    query = `SELECT COUNT(*) FROM "${pluralResourceName}" WHERE "_orgId" = $1`;
    values = [orgId];
  } else {
    query = `SELECT COUNT(*) FROM "${pluralResourceName}"`;
    values = [];
  }

  const result = await client.query(query, values);
  return parseInt(result.rows[0].count, 10);
}

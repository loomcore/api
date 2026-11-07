import { Db } from 'mongodb';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function getCount(db: Db, pluralResourceName: string): Promise<number> {
  const collection = db.collection(pluralResourceName);

  // Check for tenant isolation from AsyncLocalStorage context
  const tenantOrgId = getTenantOrgId();

  // Note: _orgId is stored as a string (not ObjectId) per PROPERTIES_THAT_ARE_NOT_OBJECT_IDS
  if (tenantOrgId !== undefined) {
    const filter = { _orgId: tenantOrgId.toString() };
    return await collection.countDocuments(filter);
  }

  return await collection.countDocuments();
}

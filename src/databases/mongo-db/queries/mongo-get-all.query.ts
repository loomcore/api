import { Db, Document } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function getAll<T>(db: Db, operations: Operation[], pluralResourceName: string): Promise<T[]> {
  const collection = db.collection(pluralResourceName);

  // Check for tenant isolation from AsyncLocalStorage context
  // Note: _orgId is stored as a string (not ObjectId) per PROPERTIES_THAT_ARE_NOT_OBJECT_IDS
  const tenantOrgId = getTenantOrgId();

  const pipeline = new NoSqlPipeline();

  // Add tenant filter if present
  if (tenantOrgId !== undefined) {
    pipeline.addMatch({ filters: { _orgId: { eq: tenantOrgId } } });
  }

  pipeline.addOperations(operations);
  const builtPipeline = pipeline.build();

  let aggregateResult: Document[];

  // When we have a tenant filter or operations, always use aggregate
  // For simple find without filters, use the more efficient find approach
  if (builtPipeline.length === 0 && tenantOrgId === undefined) {
    const cursor = collection.find();
    aggregateResult = await cursor.toArray();
  } else {
    const cursor = collection.aggregate(builtPipeline);
    aggregateResult = await cursor.toArray();
  }
  return aggregateResult as T[];
}

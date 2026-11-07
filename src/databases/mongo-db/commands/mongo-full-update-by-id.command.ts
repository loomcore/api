import { Db, ObjectId } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function fullUpdateById<T>(db: Db, operations: Operation[], id: AppIdType, entity: any, pluralResourceName: string): Promise<T> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }

  const collection = db.collection(pluralResourceName);

  // Build filter with _id and optional tenant isolation from AsyncLocalStorage context
  // Note: _orgId is stored as a string (not ObjectId) per PROPERTIES_THAT_ARE_NOT_OBJECT_IDS
  const filter: Record<string, unknown> = { _id: new ObjectId(id.toString()) };
  const tenantOrgId = getTenantOrgId();
  if (tenantOrgId !== undefined) {
    filter._orgId = tenantOrgId.toString();
  }

  let replaceResult;
  try {
    replaceResult = await collection.replaceOne(filter, entity);
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) {
      throw new DuplicateKeyError(`${pluralResourceName} already exists`);
    }
    throw err;
  }
  if (replaceResult.matchedCount <= 0) {
    throw new IdNotFoundError();
  }

  // Build pipeline for operations, including tenant filter
  const filters: Record<string, { eq: AppIdType }> = { _id: { eq: id } };
  if (tenantOrgId !== undefined) {
    filters._orgId = { eq: tenantOrgId };
  }

  const pipeline = new NoSqlPipeline()
    .addMatch({ filters })
    .addOperations(operations)
    .build();

  const updatedEntity = await collection.aggregate(pipeline).next();
  if (!updatedEntity) {
    throw new IdNotFoundError();
  }

  return updatedEntity as T;
}

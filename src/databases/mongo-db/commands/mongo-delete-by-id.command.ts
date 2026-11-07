import { Db, ObjectId } from 'mongodb';
import { DeleteResult as GenericDeleteResult } from '../../models/delete-result.js';
import { BadRequestError } from '../../../errors/index.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';
import { getTenantOrgId } from '../../../services/tenant-context.js';

export async function deleteById(db: Db, id: AppIdType, pluralResourceName: string): Promise<GenericDeleteResult> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }
  const collection = db.collection(pluralResourceName);
  const objectId = new ObjectId(id);

  // Build filter with _id and optional tenant isolation from AsyncLocalStorage context
  // Note: _orgId is stored as a string (not ObjectId) per PROPERTIES_THAT_ARE_NOT_OBJECT_IDS
  const filter: Record<string, unknown> = { _id: objectId };
  const tenantOrgId = getTenantOrgId();
  if (tenantOrgId !== undefined) {
    filter._orgId = tenantOrgId.toString();
  }

  const deleteResult = await collection.deleteOne(filter);

  return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

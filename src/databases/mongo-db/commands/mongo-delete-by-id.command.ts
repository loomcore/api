import { Db, ObjectId } from 'mongodb';
import { DeleteResult as GenericDeleteResult } from '../../models/delete-result.js';
import { BadRequestError } from '../../../errors/index.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';

export async function deleteById(db: Db, id: AppIdType, pluralResourceName: string, orgId?: AppIdType): Promise<GenericDeleteResult> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }
  const collection = db.collection(pluralResourceName);
  const objectId = new ObjectId(id);

  const filter: Record<string, unknown> = { _id: objectId };
  if (orgId !== undefined) {
    filter._orgId = orgId.toString();
  }

  const deleteResult = await collection.deleteOne(filter);

  return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

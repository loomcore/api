import { Db, ObjectId } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { entityUtils } from '@loomcore/common/utils';
import { IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';

export async function fullUpdateById<T extends IEntity>(db: Db, operations: Operation[], id: AppIdType, entity: Partial<T>, pluralResourceName: string, orgId?: AppIdType): Promise<T> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }

  const collection = db.collection(pluralResourceName);
  // Build match document and extract the filter object
  const filter: Record<string, unknown> = { _id: new ObjectId(id.toString()) };
  if (orgId !== undefined) {
    filter._orgId = orgId.toString();
  }

  let replaceResult;
  try {
    replaceResult = await collection.replaceOne(filter, entity);
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) { // this is the MongoDb error code for duplicate key
      throw new DuplicateKeyError(`${pluralResourceName} already exists`);
    }
    throw err;
  }
  if (replaceResult.matchedCount <= 0) {
    throw new IdNotFoundError();
  }

  const filters: Record<string, { eq: AppIdType }> = { _id: { eq: id } };
  if (orgId !== undefined) {
    filters._orgId = { eq: orgId };
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

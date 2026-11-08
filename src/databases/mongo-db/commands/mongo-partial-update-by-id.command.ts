import { Db, ObjectId } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';

export async function partialUpdateById<T>(db: Db, operations: Operation[], id: AppIdType, entity: Partial<any>, pluralResourceName: string, orgId?: AppIdType): Promise<T> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }
  const collection = db.collection(pluralResourceName);

  const filter: Record<string, unknown> = { _id: new ObjectId(id.toString()) };
  if (orgId !== undefined) {
    filter._orgId = orgId.toString();
  }

  let updatedEntity;
  try {
    updatedEntity = await collection.findOneAndUpdate(
      filter,
      { $set: entity },
      { returnDocument: 'after' }
    );
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) {
      throw new DuplicateKeyError(`${pluralResourceName} already exists`);
    }
    throw err;
  }

  if (!updatedEntity) {
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

  const updatedEntityWithOperations = await collection.aggregate(pipeline).next();
  if (!updatedEntityWithOperations) {
    throw new IdNotFoundError();
  }
  return updatedEntityWithOperations as T;
}

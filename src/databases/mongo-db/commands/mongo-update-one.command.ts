import { Db } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';
import { IEntity } from '@loomcore/common/models';
import type { Filters } from '../../../services/filters.type.js';

export async function updateOne<T extends IEntity>(db: Db, pluralResourceName: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T> {
  const collection = db.collection(pluralResourceName);
  // Build match document and extract the filter object
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match || {};

  // For partial update, we use findOneAndUpdate with $set
  // The operations are used when retrieving the updated entity
  let updatedEntity;
  try {
    updatedEntity = await collection.findOneAndUpdate(
      filter,
      { $set: entity },
      { returnDocument: 'after' }
    );
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) { // this is the MongoDb error code for duplicate key
      throw new DuplicateKeyError(`${pluralResourceName} already exists`);
    }
    throw err;
  }

  if (!updatedEntity) {
    throw new IdNotFoundError();
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

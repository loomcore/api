import { Db } from 'mongodb';
import { IEntity } from '@loomcore/common/models';
import { Operation } from '../../operations/operation.js';
import { DuplicateKeyError, NotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import type { Filters } from '../../../services/filters.type.js';

export async function updateMany<T extends IEntity>(db: Db, pluralResourceName: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T[]> {
  const collection = db.collection(pluralResourceName);
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match;
  let updateResult;
  try {
    updateResult = await collection.updateMany(filter, { $set: entity });
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) { // this is the MongoDb error code for duplicate key
      throw new DuplicateKeyError(`One or more ${pluralResourceName} already exist`);
    }
    throw err;
  }
  
  if (updateResult.matchedCount <= 0) {
    throw new NotFoundError('No records found matching update query');
  }
  
  // Build pipeline for retrieving updated entities (with operations)
  const pipeline = new NoSqlPipeline()
    .addMatch({ filters })
    .addOperations(operations)
    .build();
  
  const updatedEntities = await collection.aggregate(pipeline).toArray();
  
  return updatedEntities as T[];
}

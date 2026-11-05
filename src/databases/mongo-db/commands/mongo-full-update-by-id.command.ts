import { IQueryOptions } from '@loomcore/common/models';
import { Db } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';

export async function fullUpdateById<T>(db: Db, operations: Operation[], queryOptions: IQueryOptions, id: AppIdType, entity: any, pluralResourceName: string): Promise<T> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }

  const collection = db.collection(pluralResourceName);

  // Build combined filter with _id and any additional queryOptions filters (e.g., _orgId for tenant isolation)
  const combinedFilters = {
    ...queryOptions.filters,
    _id: { eq: id },
  };
  const matchDocument = buildNoSqlMatch({ filters: combinedFilters });
  const filter = matchDocument.$match;

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

  const pipeline = new NoSqlPipeline()
    .addMatch({ filters: combinedFilters })
    .addOperations(operations)
    .build();

  const updatedEntity = await collection.aggregate(pipeline).next();
  if (!updatedEntity) {
    throw new IdNotFoundError();
  }

  return updatedEntity as T;
}

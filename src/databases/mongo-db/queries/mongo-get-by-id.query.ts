import { Db } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { entityUtils } from '@loomcore/common/utils';
import { BadRequestError } from '../../../errors/index.js';
import { IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { partitionFilters } from '../../utils/resolve-join-filter.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { buildJoinMatchStage } from '../utils/build-join-match.util.js';

export async function getById<T>(db: Db, operations: Operation[], queryObject: IQueryOptions, id: AppIdType, pluralResourceName: string): Promise<T | null> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }
  const collection = db.collection(pluralResourceName);

  queryObject.filters || (queryObject.filters = {});
  queryObject.filters._id = { eq: id };

  const { rootOptions, joinFilters } = partitionFilters(queryObject, operations, pluralResourceName);
  const pipelineBuilder = new NoSqlPipeline()
    .addMatch(rootOptions)
    .addOperations(operations);
  const joinMatch = buildJoinMatchStage(joinFilters, operations);
  if (joinMatch) {
    pipelineBuilder.addStage(joinMatch);
  }
  const pipeline = pipelineBuilder.build();

  const entity =await collection.aggregate(pipeline).next();

  return entity as T | null;
}


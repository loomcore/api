import { Db } from 'mongodb';
import { IModelSpec, IQueryOptions, IPagedResult } from '@loomcore/common/models';
import { Operation } from '../../operations/operation.js';
import { splitFiltersByType } from '../../utils/resolve-join-filter.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { buildJoinMatchStage } from '../utils/build-join-match.util.js';
import { apiUtils } from '../../../utils/api.utils.js';


export async function get<T>(db: Db, operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
  const collection = db.collection(pluralResourceName);
  const { rootOptions, joinFilters } = splitFiltersByType(queryOptions, operations, pluralResourceName);
  const pipelineBuilder = new NoSqlPipeline()
    .addMatch(rootOptions, modelSpec)
    .addOperations(operations);
  const joinMatch = buildJoinMatchStage(joinFilters, operations);
  if (joinMatch) {
    pipelineBuilder.addStage(joinMatch);
  }
  const pipeline = pipelineBuilder
    .addQueryOptions(queryOptions, true)
    .build();

  const cursor = collection.aggregate(pipeline);
  const aggregateResult = await cursor.next();

  const pagedResult = apiUtils.getPagedResult<T>(
    aggregateResult?.data || [],
    aggregateResult?.total || 0,
    queryOptions
  );
  return pagedResult;
}


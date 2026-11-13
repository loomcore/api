import { Db } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import type { Filters } from '../../../services/filters.type.js';
import { splitFiltersByType } from '../../utils/resolve-join-filter.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { buildJoinMatchStage } from '../utils/build-join-match.util.js';
import { buildNoSqlMatch } from '../utils/index.js';

export async function findOne<T>(db: Db, pluralResourceName: string, filters: Filters, operations?: Operation[]): Promise<T | null> {
  const collection = db.collection(pluralResourceName);

  if (!operations || operations.length === 0) {
    const matchDocument = buildNoSqlMatch({ filters });
    const filter = matchDocument.$match;
    const entity = await collection.findOne(filter);
    return entity as T | null;
  }

  const queryObject = { filters };
  const { rootOptions, joinFilters } = splitFiltersByType(queryObject, operations, pluralResourceName);
  const pipelineBuilder = new NoSqlPipeline()
    .addMatch(rootOptions)
    .addOperations(operations);
  const joinMatch = buildJoinMatchStage(joinFilters, operations);
  if (joinMatch) {
    pipelineBuilder.addStage(joinMatch);
  }
  const pipeline = pipelineBuilder.build();

  const entity = await collection.aggregate(pipeline).next();

  return entity as T | null;
}

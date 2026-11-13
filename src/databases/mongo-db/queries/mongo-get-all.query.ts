import { Db, Document } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import type { Filters } from '../../../services/filters.type.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';

export async function getAll<T>(db: Db, pluralResourceName: string, filters: Filters, operations: Operation[]): Promise<T[]> {
  const collection = db.collection(pluralResourceName);

  const pipeline = new NoSqlPipeline();

  pipeline.addMatch({ filters });
  pipeline.addOperations(operations);
  const builtPipeline = pipeline.build();

  let aggregateResult: Document[];

  const hasFilters = filters && Object.keys(filters).length > 0;
  const hasOperations = operations && operations.length > 0;

  if (!hasFilters && !hasOperations) {
    // Use existing simple find approach if no additional stages
    // This is more efficient than using aggregate for simple queries
    const cursor = collection.find();
    aggregateResult = await cursor.toArray();
  } else {
    const cursor = collection.aggregate(builtPipeline);
    aggregateResult = await cursor.toArray();
  }
  return aggregateResult as T[];
}

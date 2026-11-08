import { Db, Document } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import type { AppIdType } from '@loomcore/common/types';
import NoSqlPipeline from '../models/no-sql-pipeline.js';

export async function getAll<T>(db: Db, operations: Operation[], pluralResourceName: string, orgId?: AppIdType): Promise<T[]> {
  const collection = db.collection(pluralResourceName);

  const pipeline = new NoSqlPipeline();

  if (orgId !== undefined) {
    pipeline.addMatch({ filters: { _orgId: { eq: orgId } } });
  }

  pipeline.addOperations(operations);
  const builtPipeline = pipeline.build();

  let aggregateResult: Document[];

  if (builtPipeline.length === 0 && orgId === undefined) {
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

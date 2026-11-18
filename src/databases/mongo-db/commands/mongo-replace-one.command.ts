import { Db } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';
import { IEntity } from '@loomcore/common/models';
import type { Filters } from '../../../services/filters.type.js';

/** Same set Postgres replaceOne skips — full replace never overwrites these. */
const PRESERVED_FIELDS = ['_id', '_created', '_createdBy'] as const;

export async function replaceOne<T extends IEntity>(db: Db, pluralResourceName: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T> {
  const collection = db.collection(pluralResourceName);
  // Build match document and extract the filter object
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match || {};

  // Load the matched doc so we can keep system fields; also serves as the not-found check
  const existing = await collection.findOne(filter);
  if (!existing) {
    throw new IdNotFoundError();
  }

  // Full-replace semantics for every other field; never overwrite preserved system fields (matches Postgres)
  const replacement: Record<string, unknown> = { ...(entity as Record<string, unknown>) };
  for (const key of PRESERVED_FIELDS) {
    if (key in existing) {
      replacement[key] = existing[key];
    } else {
      delete replacement[key];
    }
  }

  let replaceResult;
  try {
    replaceResult = await collection.replaceOne(filter, replacement);
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

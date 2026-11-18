import { Db, ObjectId } from 'mongodb';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError } from '../../../errors/index.js';
import NoSqlPipeline from '../models/no-sql-pipeline.js';
import { isMongoDuplicateKeyError } from '../utils/is-mongo-duplicate-key-error.util.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';
import { IEntity } from '@loomcore/common/models';
import type { Filters } from '@loomcore/common/models';

/** Same set Postgres replaceOne skips — full replace never overwrites these. */
const PRESERVED_FIELDS = ['_id', '_created', '_createdBy'] as const;

function entityWithoutPreservedFields<T extends IEntity>(entity: Partial<T>): Record<string, unknown> {
  const replacement: Record<string, unknown> = { ...(entity as Record<string, unknown>) };
  for (const key of PRESERVED_FIELDS) {
    delete replacement[key];
  }
  return replacement;
}

function idToComparableString(id: unknown): string {
  if (id instanceof ObjectId) {
    return id.toString();
  }
  return String(id);
}

export async function replaceOne<T extends IEntity>(db: Db, pluralResourceName: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T> {
  const collection = db.collection(pluralResourceName);
  // Build match document and extract the filter object
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match || {};

  // Mongo only: body _id must match the URL/filter id when present (string or ObjectId form)
  if (entity._id !== undefined && entity._id !== null && filter._id !== undefined) {
    if (idToComparableString(entity._id) !== idToComparableString(filter._id)) {
      throw new BadRequestError('_id in the body does not match the resource id');
    }
  }

  // Atomic full replace: provided fields win, omitted fields are removed, system fields keep stored values.
  // $literal so user values starting with '$' (or dotted keys) are not treated as aggregation expressions.
  // _updated/_updatedBy are NOT preserved — they come from the prepared entity (auditForUpdate).
  const replacementLiteral = entityWithoutPreservedFields(entity);
  let updateResult;
  try {
    updateResult = await collection.updateOne(filter, [
      {
        $replaceWith: {
          $mergeObjects: [
            { $literal: replacementLiteral },
            {
              _id: '$_id',
              _created: '$_created',
              _createdBy: '$_createdBy',
            },
          ],
        },
      },
    ]);
  }
  catch (err: any) {
    if (isMongoDuplicateKeyError(err)) { // this is the MongoDb error code for duplicate key
      throw new DuplicateKeyError(`${pluralResourceName} already exists`);
    }
    throw err;
  }
  if (updateResult.matchedCount <= 0) {
    throw new IdNotFoundError();
  }

  // Re-read via the same operations pipeline used by other write commands (joins, etc.)
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

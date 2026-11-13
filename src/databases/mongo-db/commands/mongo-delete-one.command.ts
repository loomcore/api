import { Db } from 'mongodb';
import { DeleteResult as GenericDeleteResult } from '../../models/delete-result.js';
import type { Filters } from '../../../services/filters.type.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';

export async function deleteOne(db: Db, pluralResourceName: string, filters: Filters): Promise<GenericDeleteResult> {
  const collection = db.collection(pluralResourceName);
  // Build match document and extract the filter object
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match || {};

  const deleteResult = await collection.deleteOne(filter);

  return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

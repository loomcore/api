import { Db } from 'mongodb';
import type { Filters } from '../../../services/filters.type.js';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';

export async function getCount(db: Db, pluralResourceName: string, filters: Filters): Promise<number> {
  const collection = db.collection(pluralResourceName);
  const matchDocument = buildNoSqlMatch({ filters });
  const filter = matchDocument.$match || {};

  return await collection.countDocuments(filter);
}

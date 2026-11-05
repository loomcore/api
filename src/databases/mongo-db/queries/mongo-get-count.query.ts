import { IQueryOptions } from '@loomcore/common/models';
import { Db } from 'mongodb';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';

export async function getCount(db: Db, queryOptions: IQueryOptions, pluralResourceName: string): Promise<number> {
  const collection = db.collection(pluralResourceName);

  const hasFilters = queryOptions.filters && Object.keys(queryOptions.filters).length > 0;
  if (hasFilters) {
    const matchDocument = buildNoSqlMatch(queryOptions);
    const filter = matchDocument.$match;
    return await collection.countDocuments(filter);
  }

  return await collection.countDocuments();
}


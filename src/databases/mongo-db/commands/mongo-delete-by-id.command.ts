import { IQueryOptions } from '@loomcore/common/models';
import { Db, ObjectId } from 'mongodb';
import { DeleteResult as GenericDeleteResult } from '../../models/delete-result.js';
import { BadRequestError } from '../../../errors/index.js';
import { entityUtils } from '@loomcore/common/utils';
import type { AppIdType } from '@loomcore/common/types';
import { buildNoSqlMatch } from '../utils/build-no-sql-match.util.js';

export async function deleteById(db: Db, queryOptions: IQueryOptions, id: AppIdType, pluralResourceName: string): Promise<GenericDeleteResult> {
  if (!entityUtils.isValidObjectId(id)) {
    throw new BadRequestError('id is not a valid ObjectId');
  }
  const collection = db.collection(pluralResourceName);

  // Build combined filter with _id and any additional queryOptions filters (e.g., _orgId for tenant isolation)
  const combinedFilters = {
    ...queryOptions.filters,
    _id: { eq: id },
  };
  const matchDocument = buildNoSqlMatch({ filters: combinedFilters });
  const filter = matchDocument.$match;

  const deleteResult = await collection.deleteOne(filter);

  return new GenericDeleteResult(deleteResult.acknowledged, deleteResult.deletedCount);
}

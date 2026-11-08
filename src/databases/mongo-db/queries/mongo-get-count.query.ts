import { Db } from 'mongodb';
import type { AppIdType } from '@loomcore/common/types';

export async function getCount(db: Db, pluralResourceName: string, orgId?: AppIdType): Promise<number> {
  const collection = db.collection(pluralResourceName);

  if (orgId !== undefined) {
    const filter = { _orgId: orgId.toString() };
    return await collection.countDocuments(filter);
  }

  return await collection.countDocuments();
}

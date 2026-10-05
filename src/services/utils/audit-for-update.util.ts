import type { IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import moment from 'moment';

export function auditForUpdate(userContext: IUserContext, doc: any) {
  const userId: AppIdType = userContext.impersonatorId ?? userContext.user?._id;
  doc._updated = moment().utc().toDate();
  doc._updatedBy = userId;
}

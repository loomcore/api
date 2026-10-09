import type { IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import moment from 'moment';

export function auditForCreate(userContext: IUserContext, doc: any) {
  const now = moment().utc().toDate();
  const userId: AppIdType = userContext.impersonatorId ?? userContext.user?._id;
  doc._created = now;
  doc._createdBy = userId;
}

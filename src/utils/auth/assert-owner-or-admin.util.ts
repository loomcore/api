import type { IAuditable, IUserContext } from '@loomcore/common/models';
import { UnauthorizedError } from '../../errors/index.js';
import { isAdmin } from './is-admin.util.js';

export function assertOwnerOrAdmin(
  userContext: IUserContext,
  auditable: IAuditable,
): void {
  if (isAdmin(userContext)) {
    return;
  }
  if (userContext.user._id !== auditable._createdBy) {
    throw new UnauthorizedError();
  }
}

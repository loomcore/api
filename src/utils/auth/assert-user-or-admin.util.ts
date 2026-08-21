import type { IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { UnauthorizedError } from '../../errors/index.js';
import { isAdmin } from './is-admin.util.js';

export function assertUserOrAdmin(
  userContext: IUserContext,
  userId: AppIdType,
): void {
  if (isAdmin(userContext)) {
    return;
  }
  if (userContext.user._id !== userId) {
    throw new UnauthorizedError();
  }
}

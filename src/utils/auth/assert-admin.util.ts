import type { IUserContext } from '@loomcore/common/models';
import { UnauthorizedError } from '../../errors/index.js';
import { isAdmin } from './is-admin.util.js';

export function assertAdmin(userContext: IUserContext): void {
  if (!isAdmin(userContext)) {
    throw new UnauthorizedError();
  }
}

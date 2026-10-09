import type { IUserContext } from '@loomcore/common/models';
import { getSystemUserId } from '@loomcore/common/validation';

export function isSystemUser(userContext: IUserContext): boolean {
    return userContext.user?._id === getSystemUserId();
}
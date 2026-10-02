import { getSystemUserContext, type IUserContext } from '@loomcore/common/models';

export function isSystemUser(userContext: IUserContext): boolean {
    const systemUserContext = getSystemUserContext();

    return userContext.user._id === systemUserContext.user._id;
}
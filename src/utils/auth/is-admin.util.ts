import { getSystemUserContext, type IUserContext } from '@loomcore/common/models';

export function isAdmin(userContext: IUserContext): boolean {
  return userContext.features.some(
    (feature) => feature === 'admin',
  );
}

export function isMetaOrgAdmin(userContext: IUserContext): boolean {
  const systemUserContext = getSystemUserContext();

  return isAdmin(userContext) && userContext.user._orgId === systemUserContext.user._orgId;
}
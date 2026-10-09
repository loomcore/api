import { getSystemUserContext, type IUserContext } from '@loomcore/common/models';

export function isAdmin(userContext: IUserContext): boolean {
  return userContext.features.some(
    (feature) => feature === 'admin',
  );
}

export function isMetaOrgAdmin(userContext: IUserContext): boolean {
  if (!isAdmin(userContext)) {
    return false;
  }

  const systemUserContext = getSystemUserContext();
  return userContext.user._orgId === systemUserContext.user._orgId;
}
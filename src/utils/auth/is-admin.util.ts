import type { IUserContext } from '@loomcore/common/models';

export function isAdmin(userContext: IUserContext): boolean {
  return userContext.features.some(
    (feature) => feature === 'admin' || feature === 'system',
  );
}

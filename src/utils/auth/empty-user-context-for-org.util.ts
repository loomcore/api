import { EmptyUserContext, type IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';

/**
 * Per-request anonymous userContext for a known host org.
 * `_orgId` lives on `IUser` in @loomcore/common — same field TenantScope and services already read.
 * Does not mutate the shared EmptyUserContext constant.
 */
export function emptyUserContextForOrg(organizationId: AppIdType): IUserContext {
  return {
    ...EmptyUserContext,
    user: {
      ...EmptyUserContext.user,
      _orgId: organizationId,
    },
  };
}

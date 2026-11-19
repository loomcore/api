import type { IUserContext } from '@loomcore/common/models';

/**
 * Whether a userContext represents an authenticated user.
 * Presence of userContext alone never means authenticated (EmptyUserContext / host-org empty still count as present).
 * Authenticated contexts always carry a user `_id` from the JWT payload.
 */
export function isAuthenticatedUserContext(userContext: IUserContext | undefined | null): boolean {
  return userContext?.user?._id != null;
}

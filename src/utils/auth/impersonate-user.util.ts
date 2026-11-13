import {
  ILoginResponse,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { IDatabase } from '../../databases/models/index.js';
import { BadRequestError } from '../../errors/index.js';
import { AuthorizationService } from '../../services/authorization.service.js';
import type { IRequestContext } from '../../services/request-context.interface.js';
import { UserService } from '../../services/user.service.js';
import { generateJwt, IMPERSONATION_JWT_EXPIRATION_IN_SECONDS } from '../jwt.utils.js';
import { getExpiresOnFromSeconds } from './get-expires-on-from-seconds.util.js';
import { isAdmin } from './is-admin.util.js';

export async function impersonateUser(
  database: IDatabase,
  impersonatorContext: IRequestContext,
  targetUserId: AppIdType,
  refreshToken: string,
  userService: UserService = new UserService(database),
  authorizationsService: AuthorizationService = new AuthorizationService(database),
): Promise<ILoginResponse> {
  const impersonatorUserContext = impersonatorContext.userContext;

  if (impersonatorUserContext.impersonatorId) {
    throw new BadRequestError('Already impersonating.');
  }

  if (impersonatorUserContext.user._id === targetUserId) {
    throw new BadRequestError('Cannot impersonate yourself.');
  }

  const targetUser = await userService.findOne(impersonatorContext, {
    filters: { _id: { eq: targetUserId } },
  });
  if (!targetUser) {
    throw new BadRequestError('User not found');
  }

  const targetFeatures = await authorizationsService.getUserContextFeatures(targetUser);
  const impersonatedUserContext = {
    user: targetUser,
    features: targetFeatures,
    impersonatorId: impersonatorUserContext.user._id,
  };

  if (isAdmin(impersonatedUserContext)) {
    throw new BadRequestError('Cannot impersonate admin user.');
  }

  const accessToken = generateJwt(impersonatedUserContext, IMPERSONATION_JWT_EXPIRATION_IN_SECONDS);

  return {
    tokens: {
      accessToken,
      refreshToken,
      expiresOn: getExpiresOnFromSeconds(IMPERSONATION_JWT_EXPIRATION_IN_SECONDS),
    },
    userContext: impersonatedUserContext,
  };
}

import {
  getSystemUserContext,
  type IModelSpec,
  type IOrganization,
  passwordValidator,
  UserSpec,
} from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import type { IDatabase } from '../../databases/models/index.js';
import type { UpdateResult } from '../../databases/models/update-result.js';
import { BadRequestError, ServerError } from '../../errors/index.js';
import { PasswordResetTokenService } from '../../services/password-reset-token.service.js';
import { UserService } from '../../services/user.service.js';

export async function resetPassword(
  database: IDatabase,
  email: string,
  passwordResetToken: string,
  password: string,
  organization: IOrganization | null,
  userService: UserService = new UserService(database),
  userSpec: IModelSpec = UserSpec,
): Promise<UpdateResult> {
  const validationErrors = entityUtils.validate(
    userSpec,
    { password: password },
    true,
    passwordValidator,
  );
  entityUtils.handleValidationResult(
    validationErrors,
    'AuthService.resetPassword',
  );

  const lowerCaseEmail = email.toLowerCase();
  const passwordResetTokenService = new PasswordResetTokenService(database);
  const systemUserContext = getSystemUserContext();

  const retrievedPasswordResetToken = await passwordResetTokenService.findOne(
    systemUserContext,
    {
      filters: { email: { eq: lowerCaseEmail }, _orgId: { eq: organization?._id } },
    },
  );

  if (!retrievedPasswordResetToken) {
    throw new ServerError(
      `Unable to retrieve password reset token for email: ${lowerCaseEmail}`,
    );
  }

  if (
    retrievedPasswordResetToken.token !== passwordResetToken ||
    retrievedPasswordResetToken.expiresOn < Date.now()
  ) {
    throw new BadRequestError('Invalid password reset token');
  }

  const user = await userService.findOne(systemUserContext, {
    filters: { email: { eq: lowerCaseEmail }, _orgId: { eq: organization?._id } },
  });

  if (!user) {
    throw new ServerError(
      `Unable to retrieve user for email: ${lowerCaseEmail}`,
    );
  }
  const result = await userService.changePassword(systemUserContext, user._id, password);
  console.log(
    `password changed using forgot-password for email: ${lowerCaseEmail}`,
  );

  await passwordResetTokenService.deleteById(
    systemUserContext,
    retrievedPasswordResetToken._id,
  );
  console.log(`passwordResetToken deleted for email: ${lowerCaseEmail}`);

  return {
    success: true,
    count: 1,
  };
}

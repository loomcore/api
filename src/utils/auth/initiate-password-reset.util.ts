import { type IUserContext } from '@loomcore/common/models';
import type { IDatabase } from '../../databases/models/index.js';
import { ServerError } from '../../errors/index.js';
import type { IAuthConfig } from '../../models/auth-config.interface.js';
import { EmailService } from '../../services/email.service.js';
import { PasswordResetTokenService } from '../../services/password-reset-token.service.js';
import { getAuthConfig } from './get-auth-config.util.js';
import { getExpiresOnFromMinutes } from './get-expires-on-from-minutes.util.js';
import { AppIdType } from '@loomcore/common/types';

/**
 * Kind of password email to send when initiating a password reset.
 *
 * To add a new type: add it to this union, add a table entry in `passwordEmails`,
 * and add an EmailService method plus an optional IEmailClient method.
 */
export type PasswordEmailType = 'resetPassword' | 'welcome';

/** Default welcome-email token expiry (7 days) used when auth config does not set welcomeEmailTokenExpirationInMinutes. */
export const DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES = 7 * 24 * 60;

const passwordEmails: Record<
  PasswordEmailType,
  {
    getExpiryInMinutes: (authConfig: IAuthConfig) => number;
    send: (emailService: EmailService, to: string, link: string) => Promise<void>;
  }
> = {
  resetPassword: {
    getExpiryInMinutes: (authConfig) => authConfig.passwordResetTokenExpirationInMinutes,
    send: (emailService, to, link) => emailService.sendResetPasswordEmail(to, link),
  },
  welcome: {
    getExpiryInMinutes: (authConfig) =>
      authConfig.welcomeEmailTokenExpirationInMinutes ?? DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES,
    send: (emailService, to, link) => emailService.sendWelcomeEmail(to, link),
  },
};

/**
 * Create a password-reset token and email a link to set or reset the password.
 * `emailType` selects which expiry and EmailService method to use; defaults to `'resetPassword'`.
 */
export async function initiatePasswordReset(
  userContext: IUserContext,
  database: IDatabase,
  organizationId: AppIdType | undefined,
  emailAddress: string,
  clientBaseUrl: string,
  emailType: PasswordEmailType = 'resetPassword',
) {
  const authConfig = getAuthConfig();
  const passwordEmail = passwordEmails[emailType];
  const passwordResetTokenService = new PasswordResetTokenService(database);
  const emailService = new EmailService();

  const expiresOn = getExpiresOnFromMinutes(passwordEmail.getExpiryInMinutes(authConfig));

  const passwordResetToken = await passwordResetTokenService.createPasswordResetToken(
    userContext,
    organizationId,
    emailAddress,
    expiresOn,
  );

  if (!passwordResetToken) {
    throw new ServerError(`Failed to create password reset token for email: ${emailAddress}`);
  }

  const urlEncodedEmail = encodeURIComponent(emailAddress);
  const resetPasswordLink = `${clientBaseUrl}/reset-password/${passwordResetToken.token}/${urlEncodedEmail}`;

  await passwordEmail.send(emailService, emailAddress, resetPasswordLink);
}

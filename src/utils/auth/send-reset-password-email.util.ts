import { type IUserContext } from '@loomcore/common/models';
import type { IDatabase } from '../../databases/models/index.js';
import { ServerError } from '../../errors/index.js';
import type { IEmailContent } from '../../models/email-client.interface.js';
import { EmailService } from '../../services/email.service.js';
import { PasswordResetTokenService } from '../../services/password-reset-token.service.js';
import { getAuthConfig } from './get-auth-config.util.js';
import { getExpiresOnFromMinutes } from './get-expires-on-from-minutes.util.js';
import { AppIdType } from '@loomcore/common/types';

/**
 * Options for sending a password reset or welcome email.
 */
export interface ISendResetPasswordEmailOptions {
  /** Token expiry in minutes. Overrides the global authConfig.passwordResetTokenExpirationInMinutes. */
  expiryInMinutes?: number;
  /** Custom email content (subject and message). If omitted, the email client uses its default content. */
  content?: IEmailContent;
}

export async function sendResetPasswordEmail(
  userContext: IUserContext,
  database: IDatabase,
  organizationId: AppIdType | undefined,
  emailAddress: string,
  clientBaseUrl: string,
  options?: ISendResetPasswordEmailOptions,
) {
  const authConfig = getAuthConfig();
  const passwordResetTokenService = new PasswordResetTokenService(database);
  const emailService = new EmailService();

  const expiryInMinutes = options?.expiryInMinutes ?? authConfig.passwordResetTokenExpirationInMinutes;
  const expiresOn = getExpiresOnFromMinutes(expiryInMinutes);

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

  await emailService.sendResetPasswordEmail(emailAddress, resetPasswordLink, options?.content);
}

/** Default welcome email expiry: 7 days (in minutes) */
export const WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES = 7 * 24 * 60;

/** Default welcome email content */
export const WELCOME_EMAIL_DEFAULT_CONTENT: IEmailContent = {
  subject: 'Welcome - Set Your Password',
  message: 'An account has been created for you. Please click the link below to set your password.',
};

/**
 * Options for sending a welcome email to a new user.
 */
export interface ISendWelcomeEmailOptions {
  /** Token expiry in minutes. Defaults to 7 days if not specified. */
  expiryInMinutes?: number;
  /** Custom email content (subject and message). If omitted, uses welcome email default content. */
  content?: IEmailContent;
}

/**
 * Send a welcome email to a new user with a link to set their password.
 * Uses the same password reset token flow but with welcome-specific content and longer default expiry.
 */
export async function sendWelcomeEmail(
  userContext: IUserContext,
  database: IDatabase,
  organizationId: AppIdType | undefined,
  emailAddress: string,
  clientBaseUrl: string,
  options?: ISendWelcomeEmailOptions,
) {
  const expiryInMinutes = options?.expiryInMinutes ?? WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES;
  const content = options?.content ?? WELCOME_EMAIL_DEFAULT_CONTENT;

  await sendResetPasswordEmail(userContext, database, organizationId, emailAddress, clientBaseUrl, {
    expiryInMinutes,
    content,
  });
}

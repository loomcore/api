/**
 * Options for customizing email content sent by the email client.
 * If omitted, implementations should use their default content.
 */
export interface IEmailContent {
  /** Email subject line */
  subject: string;
  /** Email body/message text (can include HTML if the client supports it) */
  message: string;
}

export interface IEmailClient {
  /**
   * Send a reset password email.
   * @param toEmailAddress - The recipient email address
   * @param resetPasswordLink - The password reset link
   * @param content - Optional custom content. If omitted, use default reset password content.
   *
   * To maintain backward compatibility:
   * - Existing implementations that only accept (toEmailAddress, resetPasswordLink) will continue to work.
   * - To support custom content, update your implementation to accept the optional third parameter.
   */
  sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string, content?: IEmailContent): Promise<void>;
}
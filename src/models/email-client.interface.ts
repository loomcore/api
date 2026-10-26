/**
 * Options for customizing email wording sent by the email client.
 * If omitted, implementations should use their default wording.
 */
export interface IEmailWording {
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
   * @param wording - Optional custom wording. If omitted, use default reset password wording.
   *
   * To maintain backward compatibility:
   * - Existing implementations that only accept (toEmailAddress, resetPasswordLink) will continue to work.
   * - To support custom wording, update your implementation to accept the optional third parameter.
   */
  sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string, wording?: IEmailWording): Promise<void>;
}
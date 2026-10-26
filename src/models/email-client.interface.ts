export interface IEmailClient {
  /**
   * Send a reset password email.
   * @param toEmailAddress - The recipient email address
   * @param resetPasswordLink - The password reset link
   */
  sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string): Promise<void>;

  /**
   * Send a welcome email to a new user with a link to set their password.
   * Clients implement this with their own wording. If not implemented,
   * loomcore falls back to sendResetPasswordEmail.
   * @param toEmailAddress - The recipient email address
   * @param setPasswordLink - The link to set the password
   */
  sendWelcomeEmail?(toEmailAddress: string, setPasswordLink: string): Promise<void>;
}

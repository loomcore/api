export interface IEmailClient {
    sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string): Promise<void>;
}
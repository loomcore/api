export interface IEmailClient {
    sendHtmlEmail(toEmailAddress: string, subject: string, body: string): Promise<void>;
}
import { IEmailClient, IEmailContent } from '../models/email-client.interface.js';

export class TestEmailClient implements IEmailClient {
  sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string, content?: IEmailContent): Promise<void> {
    if (content) {
      console.log(`Sending email to ${toEmailAddress} with subject "${content.subject}", message "${content.message}", and link ${resetPasswordLink}`);
    } else {
      console.log(`Sending reset password email to ${toEmailAddress} with reset password link ${resetPasswordLink}`);
    }
    return Promise.resolve();
  }
}
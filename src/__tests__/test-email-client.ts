import { IEmailClient, IEmailWording } from '../models/email-client.interface.js';

export class TestEmailClient implements IEmailClient {
  sendResetPasswordEmail(toEmailAddress: string, resetPasswordLink: string, wording?: IEmailWording): Promise<void> {
    if (wording) {
      console.log(`Sending email to ${toEmailAddress} with subject "${wording.subject}", message "${wording.message}", and link ${resetPasswordLink}`);
    } else {
      console.log(`Sending reset password email to ${toEmailAddress} with reset password link ${resetPasswordLink}`);
    }
    return Promise.resolve();
  }
}
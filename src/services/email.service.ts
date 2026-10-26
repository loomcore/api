import { config } from '../config/index.js';
import { ServerError } from '../errors/index.js';
import type { IEmailClient, IEmailWording } from '../models/email-client.interface.js';

export class EmailService {
  private emailClient: IEmailClient;
  constructor() {
    if (config.thirdPartyClients?.emailClient) {
      this.emailClient = config.thirdPartyClients.emailClient;
    } else {
      throw new ServerError(
        'Email client is not available. Email client is not set in the config.',
      );
    }
  }

  async sendResetPasswordEmail(emailAddress: string, resetPasswordLink: string, wording?: IEmailWording) {
    try {
      await this.emailClient.sendResetPasswordEmail(emailAddress, resetPasswordLink, wording);
      console.log(`Reset password email sent to ${emailAddress} with reset password link ${resetPasswordLink}`);
    } catch (error) {
      console.error('Error sending reset password email:', error);
      throw new ServerError('Error sending reset password email');
    }
  }
}

import { config } from '../config/index.js';
import { ServerError } from '../errors/index.js';
import type { IEmailClient } from '../models/email-client.interface.js';
import { logger } from '../utils/logger.utils.js';

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

  async sendResetPasswordEmail(emailAddress: string, resetPasswordLink: string) {
    try {
      await this.emailClient.sendResetPasswordEmail(emailAddress, resetPasswordLink);
      logger.info(`Reset password email sent to ${emailAddress}.`);
    } catch (error) {
      logger.error('Error sending reset password email:', error);
      throw new ServerError('Error sending reset password email');
    }
  }

  async sendWelcomeEmail(emailAddress: string, setPasswordLink: string) {
    try {
      if (this.emailClient.sendWelcomeEmail) {
        await this.emailClient.sendWelcomeEmail(emailAddress, setPasswordLink);
        logger.info(`Welcome email sent to ${emailAddress}.`);
      } else {
        await this.emailClient.sendResetPasswordEmail(emailAddress, setPasswordLink);
        logger.info(`Welcome email (via reset password) sent to ${emailAddress}.`);
      }
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw new ServerError('Error sending welcome email');
    }
  }
}

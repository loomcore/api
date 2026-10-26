import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { config } from '../../config/index.js';
import type { IEmailClient } from '../../models/email-client.interface.js';
import { EmailService } from '../email.service.js';

describe('EmailService.sendWelcomeEmail', () => {
  beforeAll(async () => {
    await TestExpressApp.init();
  });

  afterEach(() => {
    const client = config.thirdPartyClients?.emailClient;
    if (client) {
      delete client.sendWelcomeEmail;
    }
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  it('calls the client sendWelcomeEmail when it is defined', async () => {
    const client = config.thirdPartyClients!.emailClient as IEmailClient;
    const sendWelcomeEmail = vi.fn().mockResolvedValue(undefined);
    client.sendWelcomeEmail = sendWelcomeEmail;
    const sendResetPasswordEmail = vi.spyOn(client, 'sendResetPasswordEmail');

    const emailService = new EmailService();
    await emailService.sendWelcomeEmail('new-user@example.com', 'https://example.com/reset-password/token/email');

    expect(sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      'new-user@example.com',
      'https://example.com/reset-password/token/email',
    );
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('falls back to the client sendResetPasswordEmail when sendWelcomeEmail is not defined', async () => {
    const client = config.thirdPartyClients!.emailClient as IEmailClient;
    delete client.sendWelcomeEmail;
    const sendResetPasswordEmail = vi.spyOn(client, 'sendResetPasswordEmail');

    const emailService = new EmailService();
    await emailService.sendWelcomeEmail('new-user@example.com', 'https://example.com/reset-password/token/email');

    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);
    expect(sendResetPasswordEmail).toHaveBeenCalledWith(
      'new-user@example.com',
      'https://example.com/reset-password/token/email',
    );
  });
});

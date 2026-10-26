import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import testUtils from '../../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { getTestMetaOrgUserContext } from '../../../__tests__/test-objects.js';
import { config } from '../../../config/index.js';
import { PasswordResetTokenService } from '../../../services/password-reset-token.service.js';
import { EmailService } from '../../../services/email.service.js';
import { getAuthConfig } from '../get-auth-config.util.js';
import {
  initiatePasswordReset,
  DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES,
} from '../initiate-password-reset.util.js';

describe('initiatePasswordReset', () => {
  let testDatabase: any;
  let passwordResetTokenService: PasswordResetTokenService;
  let sendResetPasswordEmailSpy: ReturnType<typeof vi.spyOn>;
  let sendWelcomeEmailSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testDatabase = testSetup.database;
    passwordResetTokenService = new PasswordResetTokenService(testDatabase);
  });

  afterEach(async () => {
    await TestExpressApp.clearCollections();
    if (config.auth) {
      delete config.auth.welcomeEmailTokenExpirationInMinutes;
    }
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  function spyOnEmailService() {
    sendResetPasswordEmailSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();
    sendWelcomeEmailSpy = vi.spyOn(EmailService.prototype, 'sendWelcomeEmail').mockResolvedValue();
  }

  it('uses the auth config reset expiry and calls EmailService.sendResetPasswordEmail by default', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'test@example.com';
    const clientBaseUrl = 'https://example.com';
    const authConfig = getAuthConfig();

    spyOnEmailService();

    const beforeCall = Date.now();
    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl);
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    expect(token?.email).toBe(email.toLowerCase());
    expect(token?.token).toBeDefined();

    const expectedMinExpiry = beforeCall + authConfig.passwordResetTokenExpirationInMinutes * 60 * 1000;
    const expectedMaxExpiry = afterCall + authConfig.passwordResetTokenExpirationInMinutes * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    expect(sendResetPasswordEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendWelcomeEmailSpy).not.toHaveBeenCalled();
    const [toEmail, resetLink] = sendResetPasswordEmailSpy.mock.calls[0];
    expect(toEmail).toBe(email);
    expect(resetLink).toContain(`${clientBaseUrl}/reset-password/`);
    expect(resetLink).toContain(encodeURIComponent(email));
  });

  it('uses the configured welcome expiry and calls EmailService.sendWelcomeEmail when emailType is welcome', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-configured@example.com';
    const clientBaseUrl = 'https://example.com';
    const configuredWelcomeExpiryMinutes = 1440;
    config.auth!.welcomeEmailTokenExpirationInMinutes = configuredWelcomeExpiryMinutes;

    spyOnEmailService();

    const beforeCall = Date.now();
    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl, 'welcome');
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + configuredWelcomeExpiryMinutes * 60 * 1000;
    const expectedMaxExpiry = afterCall + configuredWelcomeExpiryMinutes * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    expect(sendWelcomeEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendResetPasswordEmailSpy).not.toHaveBeenCalled();
    const [toEmail, resetLink] = sendWelcomeEmailSpy.mock.calls[0];
    expect(toEmail).toBe(email);
    expect(resetLink).toContain(`${clientBaseUrl}/reset-password/`);
    expect(resetLink).toContain(encodeURIComponent(email));
  });

  it('uses 10080 minutes when welcome expiry is unset and emailType is welcome', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-default@example.com';
    const clientBaseUrl = 'https://example.com';
    expect(config.auth?.welcomeEmailTokenExpirationInMinutes).toBeUndefined();

    spyOnEmailService();

    const beforeCall = Date.now();
    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl, 'welcome');
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES * 60 * 1000;
    const expectedMaxExpiry = afterCall + DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);
    expect(DEFAULT_WELCOME_EMAIL_TOKEN_EXPIRATION_IN_MINUTES).toBe(10080);

    expect(sendWelcomeEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendResetPasswordEmailSpy).not.toHaveBeenCalled();
  });
});

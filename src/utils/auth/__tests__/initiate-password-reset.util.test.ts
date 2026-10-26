import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import testUtils from '../../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { getTestMetaOrgUserContext } from '../../../__tests__/test-objects.js';
import { PasswordResetTokenService } from '../../../services/password-reset-token.service.js';
import { EmailService } from '../../../services/email.service.js';
import { getAuthConfig } from '../get-auth-config.util.js';
import {
  initiatePasswordReset,
  sendWelcomeEmail,
  WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES,
  WELCOME_EMAIL_DEFAULT_CONTENT,
  IInitiatePasswordResetOptions,
  ISendWelcomeEmailOptions,
} from '../initiate-password-reset.util.js';

describe('initiatePasswordReset', () => {
  let testDatabase: any;
  let passwordResetTokenService: PasswordResetTokenService;
  let emailServiceSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testDatabase = testSetup.database;
    passwordResetTokenService = new PasswordResetTokenService(testDatabase);
  });

  afterEach(async () => {
    await TestExpressApp.clearCollections();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  it('should create a password reset token and send email with auth-config default expiry when no options provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'test@example.com';
    const clientBaseUrl = 'https://example.com';
    const authConfig = getAuthConfig();

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

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

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [toEmail, resetLink, content] = emailServiceSpy.mock.calls[0];
    expect(toEmail).toBe(email);
    expect(resetLink).toContain(`${clientBaseUrl}/reset-password/`);
    expect(resetLink).toContain(encodeURIComponent(email));
    expect(content).toBeUndefined();
  });

  it('should use custom expiry when provided in options', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'custom-expiry@example.com';
    const clientBaseUrl = 'https://example.com';
    const customExpiryMinutes = 60;

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl, {
      expiryInMinutes: customExpiryMinutes,
    });
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + customExpiryMinutes * 60 * 1000;
    const expectedMaxExpiry = afterCall + customExpiryMinutes * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toBeUndefined();
  });

  it('should pass custom content to email service unchanged', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'custom-content@example.com';
    const clientBaseUrl = 'https://example.com';
    const customContent = {
      subject: 'Custom Subject',
      message: 'Custom message content',
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl, {
      content: customContent,
    });

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(customContent);
  });

  it('should pass both custom expiry and content when both provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'both-options@example.com';
    const clientBaseUrl = 'https://example.com';
    const options: IInitiatePasswordResetOptions = {
      expiryInMinutes: 120,
      content: {
        subject: 'Both Options Subject',
        message: 'Both options message',
      },
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await initiatePasswordReset(userContext, testDatabase, undefined, email, clientBaseUrl, options);
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + options.expiryInMinutes! * 60 * 1000;
    const expectedMaxExpiry = afterCall + options.expiryInMinutes! * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(options.content);
  });
});

describe('sendWelcomeEmail', () => {
  let testDatabase: any;
  let passwordResetTokenService: PasswordResetTokenService;
  let emailServiceSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testDatabase = testSetup.database;
    passwordResetTokenService = new PasswordResetTokenService(testDatabase);
  });

  afterEach(async () => {
    await TestExpressApp.clearCollections();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  it('should use default welcome email expiry (7 days) and content when no options provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome@example.com';
    const clientBaseUrl = 'https://example.com';

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl);
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES * 60 * 1000;
    const expectedMaxExpiry = afterCall + WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(WELCOME_EMAIL_DEFAULT_CONTENT);
  });

  it('should use custom expiry when provided while keeping default content', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-custom-expiry@example.com';
    const clientBaseUrl = 'https://example.com';
    const customExpiryMinutes = 14 * 24 * 60; // 14 days

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      expiryInMinutes: customExpiryMinutes,
    });
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + customExpiryMinutes * 60 * 1000;
    const expectedMaxExpiry = afterCall + customExpiryMinutes * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(WELCOME_EMAIL_DEFAULT_CONTENT);
  });

  it('should use custom content when provided while keeping default expiry', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-custom-content@example.com';
    const clientBaseUrl = 'https://example.com';
    const customContent = {
      subject: 'Welcome to Our Platform',
      message: 'You have been invited to join our platform. Click below to set your password.',
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      content: customContent,
    });
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES * 60 * 1000;
    const expectedMaxExpiry = afterCall + WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(customContent);
  });

  it('should use partial content (subject only) with default message', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-subject-only@example.com';
    const clientBaseUrl = 'https://example.com';
    const customSubject = 'Custom Welcome Subject';

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      content: { subject: customSubject },
    });

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual({
      subject: customSubject,
      message: WELCOME_EMAIL_DEFAULT_CONTENT.message,
    });
  });

  it('should use partial content (message only) with default subject', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-message-only@example.com';
    const clientBaseUrl = 'https://example.com';
    const customMessage = 'Custom welcome message for new user.';

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      content: { message: customMessage },
    });

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual({
      subject: WELCOME_EMAIL_DEFAULT_CONTENT.subject,
      message: customMessage,
    });
  });

  it('should use both custom expiry and content when both provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-both@example.com';
    const clientBaseUrl = 'https://example.com';
    const options: ISendWelcomeEmailOptions = {
      expiryInMinutes: 30 * 24 * 60, // 30 days
      content: {
        subject: 'Welcome to Tenant',
        message: 'Your admin account is ready.',
      },
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, options);
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + options.expiryInMinutes! * 60 * 1000;
    const expectedMaxExpiry = afterCall + options.expiryInMinutes! * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , content] = emailServiceSpy.mock.calls[0];
    expect(content).toEqual(options.content);
  });

  it('should generate the same reset password link format as initiatePasswordReset', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-link@example.com';
    const clientBaseUrl = 'https://example.com';

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl);

    const [toEmail, resetLink] = emailServiceSpy.mock.calls[0];
    expect(toEmail).toBe(email);
    expect(resetLink).toContain(`${clientBaseUrl}/reset-password/`);
    expect(resetLink).toContain(encodeURIComponent(email));
  });
});

describe('WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES', () => {
  it('should equal 7 days in minutes', () => {
    const sevenDaysInMinutes = 7 * 24 * 60;
    expect(WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES).toBe(sevenDaysInMinutes);
  });
});

describe('WELCOME_EMAIL_DEFAULT_CONTENT', () => {
  it('should have appropriate welcome subject and message', () => {
    expect(WELCOME_EMAIL_DEFAULT_CONTENT.subject).toBe('Welcome - Set Your Password');
    expect(WELCOME_EMAIL_DEFAULT_CONTENT.message).toContain('account has been created');
    expect(WELCOME_EMAIL_DEFAULT_CONTENT.message).toContain('set your password');
  });
});

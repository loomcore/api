import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import testUtils from '../../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../../__tests__/test-express-app.js';
import { getTestMetaOrgUserContext } from '../../../__tests__/test-objects.js';
import { PasswordResetTokenService } from '../../../services/password-reset-token.service.js';
import { EmailService } from '../../../services/email.service.js';
import {
  sendResetPasswordEmail,
  sendWelcomeEmail,
  WELCOME_EMAIL_DEFAULT_EXPIRY_MINUTES,
  WELCOME_EMAIL_DEFAULT_WORDING,
  ISendResetPasswordEmailOptions,
  ISendWelcomeEmailOptions,
} from '../send-reset-password-email.util.js';

describe('sendResetPasswordEmail', () => {
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

  it('should create a password reset token and send email with default expiry when no options provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'test@example.com';
    const clientBaseUrl = 'https://example.com';

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await sendResetPasswordEmail(userContext, testDatabase, undefined, email, clientBaseUrl);

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    expect(token?.email).toBe(email.toLowerCase());
    expect(token?.token).toBeDefined();
    expect(token?.expiresOn).toBeDefined();

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [toEmail, resetLink, wording] = emailServiceSpy.mock.calls[0];
    expect(toEmail).toBe(email);
    expect(resetLink).toContain(`${clientBaseUrl}/reset-password/`);
    expect(resetLink).toContain(encodeURIComponent(email));
    expect(wording).toBeUndefined();
  });

  it('should use custom expiry when provided in options', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'custom-expiry@example.com';
    const clientBaseUrl = 'https://example.com';
    const customExpiryMinutes = 60;

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendResetPasswordEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
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
  });

  it('should pass custom wording to email service', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'custom-wording@example.com';
    const clientBaseUrl = 'https://example.com';
    const customWording = {
      subject: 'Custom Subject',
      message: 'Custom message content',
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    await sendResetPasswordEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      wording: customWording,
    });

    expect(emailServiceSpy).toHaveBeenCalledTimes(1);
    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(customWording);
  });

  it('should pass both custom expiry and wording when both provided', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'both-options@example.com';
    const clientBaseUrl = 'https://example.com';
    const options: ISendResetPasswordEmailOptions = {
      expiryInMinutes: 120,
      wording: {
        subject: 'Both Options Subject',
        message: 'Both options message',
      },
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendResetPasswordEmail(userContext, testDatabase, undefined, email, clientBaseUrl, options);
    const afterCall = Date.now();

    const token = await passwordResetTokenService.findOne(userContext, {
      filters: { email: { eq: email.toLowerCase() } },
    });

    expect(token).toBeDefined();
    const expectedMinExpiry = beforeCall + options.expiryInMinutes! * 60 * 1000;
    const expectedMaxExpiry = afterCall + options.expiryInMinutes! * 60 * 1000;
    expect(token?.expiresOn).toBeGreaterThanOrEqual(expectedMinExpiry);
    expect(token?.expiresOn).toBeLessThanOrEqual(expectedMaxExpiry);

    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(options.wording);
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

  it('should use default welcome email expiry (7 days) and wording', async () => {
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
    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(WELCOME_EMAIL_DEFAULT_WORDING);
  });

  it('should allow overriding expiry while keeping default wording', async () => {
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

    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(WELCOME_EMAIL_DEFAULT_WORDING);
  });

  it('should allow overriding wording while keeping default expiry', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-custom-wording@example.com';
    const clientBaseUrl = 'https://example.com';
    const customWording = {
      subject: 'Welcome to Our Platform',
      message: 'You have been invited to join our platform. Click below to set your password.',
    };

    emailServiceSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();

    const beforeCall = Date.now();
    await sendWelcomeEmail(userContext, testDatabase, undefined, email, clientBaseUrl, {
      wording: customWording,
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

    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(customWording);
  });

  it('should allow overriding both expiry and wording', async () => {
    await testUtils.setupTestUsers();
    const userContext = getTestMetaOrgUserContext();
    const email = 'welcome-both@example.com';
    const clientBaseUrl = 'https://example.com';
    const options: ISendWelcomeEmailOptions = {
      expiryInMinutes: 30 * 24 * 60, // 30 days
      wording: {
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

    const [, , wording] = emailServiceSpy.mock.calls[0];
    expect(wording).toEqual(options.wording);
  });

  it('should generate the same reset password link format as sendResetPasswordEmail', async () => {
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

describe('WELCOME_EMAIL_DEFAULT_WORDING', () => {
  it('should have appropriate welcome subject and message', () => {
    expect(WELCOME_EMAIL_DEFAULT_WORDING.subject).toBe('Welcome - Set Your Password');
    expect(WELCOME_EMAIL_DEFAULT_WORDING.message).toContain('account has been created');
    expect(WELCOME_EMAIL_DEFAULT_WORDING.message).toContain('set your password');
  });
});

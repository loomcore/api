import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getTestMetaOrgRefererUrl,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
} from '../../__tests__/test-objects.js';
import { PasswordResetTokenService } from '../../services/password-reset-token.service.js';
import { UserService } from '../../services/user.service.js';
import { passwordUtils } from '../../utils/password.utils.js';
import { AuthController } from '../auth.controller.js';

describe('AuthController.resetPassword', () => {
  let testAgent: any;
  let userService: UserService;
  let passwordResetTokenService: PasswordResetTokenService;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    userService = new UserService(testSetup.database);
    passwordResetTokenService = new PasswordResetTokenService(
      testSetup.database,
    );

    new AuthController(testSetup.app, testSetup.database);

    await TestExpressApp.setupErrorHandling();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  it('should set _lastPasswordChange when resetting a password via forgot-password', async () => {
    const user = getTestMetaOrgUser();
    const userContext = getTestMetaOrgUserContext();
    const newPassword = 'resetSecurePassword123!';

    const userBeforeReset = await userService.findOne(userContext, {
      filters: { _id: { eq: user._id } },
    });
    expect(userBeforeReset?._lastPasswordChange).toBeUndefined();

    const forgotPasswordResponse = await testAgent
      .post('/api/auth/forgot-password')
      .set('Referer', getTestMetaOrgRefererUrl())
      .send({ email: user.email });

    expect(forgotPasswordResponse.status).toBe(200);

    const passwordResetToken = await passwordResetTokenService.findOne(
      userContext,
      {
        filters: { email: { eq: user.email.toLowerCase() } },
      },
    );

    expect(passwordResetToken?.token).toBeDefined();

    const resetPasswordResponse = await testAgent
      .post('/api/auth/reset-password')
      .set('Referer', getTestMetaOrgRefererUrl())
      .send({
        email: user.email,
        token: passwordResetToken!.token,
        password: newPassword,
      });

    expect(resetPasswordResponse.status).toBe(200);

    const userAfterReset = await userService.findOne(userContext, {
      filters: { _id: { eq: user._id } },
    });

    expect(userAfterReset?._lastPasswordChange).toBeInstanceOf(Date);
    expect(
      Date.now() - userAfterReset!._lastPasswordChange!.getTime(),
    ).toBeLessThan(5000);

    const isPasswordCorrect = await passwordUtils.comparePasswords(
      userAfterReset?.password ?? '',
      newPassword,
    );
    expect(isPasswordCorrect).toBe(true);

    const loginResponse = await testAgent
      .post('/api/auth/login')
      .set('Referer', getTestMetaOrgRefererUrl())
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({
        email: user.email,
        password: newPassword,
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.tokens.accessToken).toBeDefined();
  });
});

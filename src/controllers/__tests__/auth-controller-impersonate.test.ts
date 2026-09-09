import type { ITokenResponse, IUser } from '@loomcore/common/models';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getTestMetaOrgAdminUserContext,
  getTestMetaOrgRefererUrl,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
} from '../../__tests__/test-objects.js';
import { UserService } from '../../services/user.service.js';
import { AuthController } from '../auth.controller.js';

describe('AuthController impersonation', () => {
  const impersonateEndpoint = '/api/auth/impersonate';
  let testAgent: any;
  let userService: UserService;
  let targetUser: IUser;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    userService = new UserService(testSetup.database);

    new AuthController(testSetup.app, testSetup.database);
    await TestExpressApp.setupErrorHandling();
    await testUtils.setupTestUsers();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
    const created = await userService.create(getTestMetaOrgUserContext(), {
      email: 'impersonation-target@example.com',
      displayName: 'Impersonation Target',
      password: 'target-password-1',
    });
    if (!created) {
      throw new Error('Failed to create impersonation target user');
    }
    targetUser = created;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  async function loginAsMetaOrgUser(): Promise<ITokenResponse> {
    const response = await testAgent
      .post('/api/auth/login')
      .set('Referer', getTestMetaOrgRefererUrl())
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({
        email: getTestMetaOrgUser().email,
        password: getTestMetaOrgUser().password,
      });

    expect(response.status).toBe(200);
    return response.body.data.tokens;
  }

  async function impersonateTarget(refreshToken: string) {
    return testAgent
      .post(impersonateEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({ userId: targetUser._id, refreshToken });
  }

  it('should reject non-admin users', async () => {
    const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);

    const response = await testAgent
      .post(impersonateEndpoint)
      .set('Authorization', authorizationHeaderValue)
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({ userId: targetUser._id });

    expect(response.status).toBe(403);
  });

  it('should return an impersonation access token for the target user', async () => {
    const loginTokens = await loginAsMetaOrgUser();
    const response = await impersonateTarget(loginTokens.refreshToken);

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toBeDefined();
    expect(response.body.data.refreshToken).toBe(loginTokens.refreshToken);
    expect(response.body.data.expiresOn).toBeGreaterThan(Date.now() + 3500 * 1000);
    expect(response.body.data.expiresOn).toBeLessThan(Date.now() + 3700 * 1000);

    const payload = testUtils.verifyToken(response.body.data.accessToken);
    expect(String(payload.user._id)).toBe(String(targetUser._id));
    expect(payload.isImpersonating).toBe(true);

    const userContextResponse = await testAgent
      .get('/api/auth/get-user-context')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`)
      .expect(200);

    expect(userContextResponse.body.data.user.email).toBe(targetUser.email);
    expect(userContextResponse.body.data.isImpersonating).toBe(true);
  });

  it('should revert to the true user when the refresh token is used', async () => {
    const loginTokens = await loginAsMetaOrgUser();
    const impersonateResponse = await impersonateTarget(loginTokens.refreshToken);
    expect(impersonateResponse.status).toBe(200);
    expect(impersonateResponse.body.data.refreshToken).toBe(loginTokens.refreshToken);

    const refreshResponse = await testAgent
      .get('/api/auth/refresh')
      .query({ refreshToken: loginTokens.refreshToken })
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .expect(200);

    const payload = testUtils.verifyToken(refreshResponse.body.data.accessToken);
    expect(String(payload.user._id)).toBe(String(getTestMetaOrgUser()._id));
    expect(payload.isImpersonating).toBeFalsy();
    expect(refreshResponse.body.data.refreshToken).toBe(loginTokens.refreshToken);
  });

  it('should return a 400 when already impersonating', async () => {
    const nestedToken = jwt.sign(
      { ...getTestMetaOrgAdminUserContext(), isImpersonating: true },
      'test-secret',
      { expiresIn: 3600 },
    );

    const response = await testAgent
      .post(impersonateEndpoint)
      .set('Authorization', `Bearer ${nestedToken}`)
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({ userId: targetUser._id, refreshToken: 'dummy-refresh-token' });

    expect(response.status).toBe(400);
  });

  it('should return a 400 when the target user does not exist', async () => {
    const loginTokens = await loginAsMetaOrgUser();

    const response = await testAgent
      .post(impersonateEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({ userId: testUtils.getRandomId(), refreshToken: loginTokens.refreshToken });

    expect(response.status).toBe(400);
  });

  it('should return a 400 when impersonating yourself', async () => {
    const loginTokens = await loginAsMetaOrgUser();

    const response = await testAgent
      .post(impersonateEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
      .send({ userId: getTestMetaOrgUser()._id, refreshToken: loginTokens.refreshToken });

    expect(response.status).toBe(400);
  });

  it('should return a 403 when changing password while impersonating', async () => {
    const loginTokens = await loginAsMetaOrgUser();
    const impersonateResponse = await impersonateTarget(loginTokens.refreshToken);
    expect(impersonateResponse.status).toBe(200);

    const response = await testAgent
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${impersonateResponse.body.data.accessToken}`)
      .send({ password: 'newSecurePassword123!' });

    expect(response.status).toBe(403);
  });
});

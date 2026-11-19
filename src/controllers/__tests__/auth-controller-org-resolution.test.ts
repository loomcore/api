import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getTestMetaOrgContext,
  getTestMetaOrgRefererUrl,
  getTestMetaOrgUser,
  TEST_META_ORG_DOMAIN,
} from '../../__tests__/test-objects.js';
import { clearActiveOrganizationDomainCache } from '../../middleware/ensure-user-context.js';
import { OrganizationService } from '../../services/organization.service.js';
import { PasswordResetTokenService } from '../../services/password-reset-token.service.js';
import { AuthController } from '../auth.controller.js';

describe('AuthController org resolution from userContext', () => {
  let testAgent: any;
  let passwordResetTokenService: PasswordResetTokenService;
  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    passwordResetTokenService = new PasswordResetTokenService(testSetup.database);
    new AuthController(testSetup.app, testSetup.database);
    await TestExpressApp.setupErrorHandling();
  });

  // Typed loosely: matches existing spy patterns in this repo (vitest MockInstance generics vs method signatures).
  let findByDomainSpy: any;

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
    clearActiveOrganizationDomainCache();
    findByDomainSpy = vi.spyOn(OrganizationService.prototype, 'findByDomain');
  });

  afterEach(() => {
    findByDomainSpy.mockRestore();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  describe('POST /api/auth/login', () => {
    const apiEndpoint = '/api/auth/login';

    it('should resolve the org from Origin and succeed without a Referer', async () => {
      const user = getTestMetaOrgUser();
      const response = await testAgent
        .post(apiEndpoint)
        .unset('Referer')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
        .send({ email: user.email, password: user.password });

      expect(response.status).toBe(200);
      expect(response.body?.data?.tokens?.accessToken).toBeDefined();
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });

    it('should resolve the org from Referer when Origin is absent', async () => {
      const user = getTestMetaOrgUser();
      const response = await testAgent
        .post(apiEndpoint)
        .unset('Origin')
        .set('Referer', getTestMetaOrgRefererUrl())
        .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
        .send({ email: user.email, password: user.password });

      expect(response.status).toBe(200);
      expect(response.body?.data?.tokens?.accessToken).toBeDefined();
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call findByDomain a second time in AuthController', async () => {
      const user = getTestMetaOrgUser();
      await testAgent
        .post(apiEndpoint)
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Cookie', [`deviceId=${testUtils.constDeviceIdCookie}`])
        .send({ email: user.email, password: user.password })
        .expect(200);

      // Middleware resolves once; AuthController must not look up by domain again.
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    async function createResetTokenForMetaOrgUser(): Promise<string> {
      const user = getTestMetaOrgUser();
      const context = getTestMetaOrgContext();
      await testAgent
        .post('/api/auth/forgot-password')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Referer', getTestMetaOrgRefererUrl())
        .send({ email: user.email })
        .expect(200);

      const passwordResetToken = await passwordResetTokenService.findOne(context, {
        filters: { email: { eq: user.email.toLowerCase() } },
      });
      expect(passwordResetToken?.token).toBeDefined();
      return passwordResetToken!.token;
    }

    it('should resolve the org from Origin and succeed without a Referer', async () => {
      const user = getTestMetaOrgUser();
      const token = await createResetTokenForMetaOrgUser();
      clearActiveOrganizationDomainCache();
      findByDomainSpy.mockClear();

      const response = await testAgent
        .post('/api/auth/reset-password')
        .unset('Referer')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .send({
          email: user.email,
          token,
          password: 'resetSecurePasswordOrigin123!',
        });

      expect(response.status).toBe(200);
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });

    it('should resolve the org from Referer when Origin is absent', async () => {
      const user = getTestMetaOrgUser();
      const token = await createResetTokenForMetaOrgUser();
      clearActiveOrganizationDomainCache();
      findByDomainSpy.mockClear();

      const response = await testAgent
        .post('/api/auth/reset-password')
        .unset('Origin')
        .set('Referer', getTestMetaOrgRefererUrl())
        .send({
          email: user.email,
          token,
          password: 'resetSecurePasswordReferer123!',
        });

      expect(response.status).toBe(200);
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call findByDomain a second time in AuthController', async () => {
      const user = getTestMetaOrgUser();
      const token = await createResetTokenForMetaOrgUser();
      clearActiveOrganizationDomainCache();
      findByDomainSpy.mockClear();

      await testAgent
        .post('/api/auth/reset-password')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Referer', getTestMetaOrgRefererUrl())
        .send({
          email: user.email,
          token,
          password: 'resetSecurePasswordOnce123!',
        })
        .expect(200);

      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should resolve the org from Origin for the password-reset email flow', async () => {
      const user = getTestMetaOrgUser();
      const response = await testAgent
        .post('/api/auth/forgot-password')
        .unset('Referer')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .send({ email: user.email });

      expect(response.status).toBe(200);
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);

      const token = await passwordResetTokenService.findOne(getTestMetaOrgContext(), {
        filters: { email: { eq: user.email.toLowerCase() } },
      });
      expect(token?.token).toBeDefined();
    });

    it('should resolve the org from Referer when Origin is absent', async () => {
      const user = getTestMetaOrgUser();
      const response = await testAgent
        .post('/api/auth/forgot-password')
        .unset('Origin')
        .set('Referer', getTestMetaOrgRefererUrl())
        .send({ email: user.email });

      expect(response.status).toBe(200);
      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });

    it('should not call findByDomain a second time in AuthController', async () => {
      const user = getTestMetaOrgUser();
      await testAgent
        .post('/api/auth/forgot-password')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Referer', getTestMetaOrgRefererUrl())
        .send({ email: user.email })
        .expect(200);

      expect(findByDomainSpy).toHaveBeenCalledTimes(1);
    });
  });
});

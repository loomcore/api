import type { IUser } from '@loomcore/common/models';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { getTestMetaOrgUser } from '../../__tests__/test-objects.js';
import { AuthController } from '../auth.controller.js';
import { UsersController } from '../users.controller.js';

describe('UsersController', () => {
  let testAgent: any;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;

    new AuthController(testSetup.app, testSetup.database);
    new UsersController(testSetup.app, testSetup.database);

    await TestExpressApp.setupErrorHandling();
    await testUtils.setupTestUsers();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
  });

  describe('GET /users/me', () => {
    const apiEndpoint = '/api/users/me';

    it('should return the authenticated user without sensitive fields', async () => {
      const authorizationHeaderValue =
        await testUtils.loginWithTestUser(testAgent);

      const response = await testAgent
        .get(apiEndpoint)
        .set('Authorization', authorizationHeaderValue);

      expect(response.status).toBe(200);
      expect(response.body?.data?.email).toEqual(getTestMetaOrgUser().email);
      expect(response.body?.data?.password).toBeUndefined();
    });

    it('should return 401 when no auth token is supplied', async () => {
      const response = await testAgent.get(apiEndpoint);

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /users/me', () => {
    const apiEndpoint = '/api/users/me';

    it('should return a 200 and only update provided properties on the authenticated user', async () => {
      const authorizationHeaderValue =
        await testUtils.loginWithTestUser(testAgent);

      const updatedUser: Partial<IUser> = {
        displayName: 'Updated Me Display Name',
      };

      const response = await testAgent
        .patch(apiEndpoint)
        .set('Authorization', authorizationHeaderValue)
        .send(updatedUser);

      expect(response.status).toBe(200);
      expect(response.body?.data?.displayName).toEqual(
        'Updated Me Display Name',
      );
      expect(response.body?.data?.email).toEqual(getTestMetaOrgUser().email);
      expect(response.body?.data?.password).toBeUndefined();
    });

    it('should return 401 when no auth token is supplied', async () => {
      const response = await testAgent.patch(apiEndpoint).send({
        displayName: 'Should Not Update',
      });

      expect(response.status).toBe(401);
    });
  });
});

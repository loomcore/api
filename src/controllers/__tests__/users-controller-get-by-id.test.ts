import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { AuthController } from '../auth.controller.js';
import { UsersController } from '../users.controller.js';
import { getTestMetaOrgUser } from '../../__tests__/test-objects.js';

describe('UsersController', () => {
  let testAgent: any;
  let authController: AuthController;
  let usersController: UsersController;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init(undefined, {
      setupRoutes: (app, database) => {
        // Need to initialize AuthController in order to login with test user - needed for any endpoints that require authentication
        authController = new AuthController(app, database);
        usersController = new UsersController(app, database);
      },
    });
    testAgent = testSetup.agent;

    // Set up test user data
    await testUtils.setupTestUsers();
  });

  afterAll(async () => {
    await testUtils.deleteTestUser()
    await TestExpressApp.cleanup();
  });

  describe('GET /users/:id', () => {
    it('should reject non-admin users', async () => {
      const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);
      const apiEndpoint = `/api/users/${getTestMetaOrgUser()._id}`;

      const response = await testAgent
        .get(apiEndpoint)
        .set('Authorization', authorizationHeaderValue);

      expect(response.status).toBe(403);
    });
  });
});

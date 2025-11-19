import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { AuthController } from '../auth.controller.js';
describe('[library] AuthController', () => {
  let testAgent: any;
  let authController: AuthController;
  //let authToken: string;
  
  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    
    // Initialize the AuthController with the Express app and database
    authController = new AuthController(testSetup.app, testSetup.database);
  
    // Setup error handling middleware AFTER controller initialization
    await TestExpressApp.setupErrorHandling();
    
    // Set up test user data
    await testUtils.setupTestUser();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  describe('GET /auth/get-user-context', () => {
    const apiEndpoint = '/api/auth/get-user-context';

    it('should return a 200, and a valid client userContext when a valid authToken is supplied', async () => {
      const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);
      const response = await testAgent
        .get(apiEndpoint)
        .set('Authorization', authorizationHeaderValue)
        .expect(200);

      expect(response.body?.data?.user?.email).toEqual(testUtils.testUserEmail);
    });

    it('should return a 401 when no authToken is supplied', async () => {
      const response = await testAgent
        .get(apiEndpoint)
        .expect(401);

      expect(response.body?.errors[0]?.message).toEqual('Unauthenticated');
      expect(response.body?.data?.user).toEqual(undefined);
    });

    // test an expired authToken

  });
});


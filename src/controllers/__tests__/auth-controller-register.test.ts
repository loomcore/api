import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';

import jwt from 'jsonwebtoken';
import { config } from '../../config/base-api-config.js';
import { AuthController } from '../../controllers/auth.controller.js';
import { getTestMetaOrgUser, getTestMetaOrgUserContext, getTestMetaOrg, getTestMetaOrgUserPerson } from '../../__tests__/test-objects.js';
import { IPersonModel, IUser } from '@loomcore/common/models';

describe('AuthController', () => {
  let authToken: string;
  let testAgent: any;
  let authController: AuthController;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;

    // Initialize the AuthController with the Express app and database
    authController = new AuthController(testSetup.app, testSetup.database);

    // Setup error handling middleware AFTER controller initialization
    await TestExpressApp.setupErrorHandling();

    // Set up test user data
    await testUtils.setupTestUsers();

    // Create auth token for test user with full userContext (including organization)
    const userContext = getTestMetaOrgUserContext();
    authToken = jwt.sign(
      userContext,
      config.auth?.clientSecret ?? '',
      { expiresIn: 3600 }
    );
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  // Clear collections before each test to avoid interference
  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    // Re-create test user for tests that need it
    await testUtils.setupTestUsers();
  });

  describe('POST /auth/register', () => {
    const apiEndpoint = '/api/auth/register';

    it("should return a 201 and a newly created user on successful creation", async () => {
      const newUser: Partial<IUser> = {
        _orgId: getTestMetaOrgUser()._orgId,
        email: testUtils.newUser1Email,
        password: testUtils.newUser1Password,
      };

      const newUserPerson: Partial<IPersonModel> = {
        _orgId: getTestMetaOrgUser()._orgId,
        firstName: 'Test',
        lastName: 'User',
        isAgent: false,
        isClient: true,
        isEmployee: false,
        extendedTypes: 0
      };

      const response = await testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send({ user: newUser, person: newUserPerson })

      expect(response.status).toBe(201);
      expect(response.body?.data).toHaveProperty('_id');
      expect(response.body?.data).toHaveProperty('email', newUser.email);
      expect(response.body?.data).toHaveProperty('_orgId', getTestMetaOrgUser()._orgId);
    });

    it('should return a 400 with an invalid email', async () => {
      const newUser = {
        email: 'test',
        password: testUtils.newUser1Password,
        _orgId: getTestMetaOrgUser()._orgId
      };
      return testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send(newUser)
        .expect(400);
    });

    it('should return a 400 with an invalid password', async () => {
      const newUser = {
        email: testUtils.newUser1Email,
        password: 't',
        _orgId: getTestMetaOrgUser()._orgId
      };
      return testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send(newUser)
        .expect(400);
    });

    it('should return a 400 with missing email or password', async () => {
      await testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send({ // missing password
          email: "shouldfail@test.com",
          _orgId: getTestMetaOrgUser()._orgId
        }) // missing password
        .expect(400);

      await testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send({ // missing email
          password: "shouldfail",
          _orgId: getTestMetaOrgUser()._orgId
        }) // missing email
        .expect(400);
    });

    it('should return a 400 if user with duplicate email already exists', async () => {
      // Test user is already set up by beforeEach

      const newUser = {
        email: getTestMetaOrgUser().email,
        password: getTestMetaOrgUser().password,
        _orgId: getTestMetaOrgUser()._orgId
      };

      return testAgent
        .post(apiEndpoint)
        .set('Authorization', `Bearer ${authToken}`) // Add auth token
        .send(newUser)
        .expect(400);
    });
  });

});




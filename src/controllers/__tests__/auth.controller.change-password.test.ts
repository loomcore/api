import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { AuthController } from '../../controllers/auth.controller.js';
import { passwordUtils } from '../../utils/password.utils.js';
import { IUser } from '@loomcore/common/models';
import { Db } from 'mongodb';

describe('AuthController.changePassword', () => {
  let testAgent: any;
  let db: Db;
  
  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    db = testSetup.db;
    
    // Initialize the AuthController with the Express app and database
    new AuthController(testSetup.app, testSetup.db);
    
    // Setup error handling middleware AFTER controller initialization
    await TestExpressApp.setupErrorHandling();
  });

  beforeEach(async () => {
    // Clear collections before each test to avoid interference
    await TestExpressApp.clearCollections();
    // Re-create test user for tests that need it
    await testUtils.setupTestUser();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  it('should hash the new password and not store it in plain text', async () => {
    const newPassword = 'newSecurePassword123!';
    
    // 1. Login as the test user to get an auth token
    const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);

    // 2. Change the password
    const changePasswordResponse = await testAgent
      .patch('/api/auth/change-password')
      .set('Authorization', authorizationHeaderValue)
      .send({ password: newPassword });

    expect(changePasswordResponse.status).toBe(200);

    // 3. Fetch the user directly from the database
    const userFromDb = await db.collection<IUser>('users').findOne({ email: testUtils.testUserEmail });
    
    // 4. Verify the password in the DB is not the plain text password
    expect(userFromDb).toBeDefined();
    expect(userFromDb?.password).not.toEqual(newPassword);

    // 5. Verify the new password is valid by comparing it with the hash
    const isPasswordCorrect = await passwordUtils.comparePasswords(userFromDb!.password!, newPassword);
    expect(isPasswordCorrect).toBe(true);

    // 6. Attempt to login with the new password to confirm
    const loginResponse = await testAgent
      .post('/api/auth/login')
      .send({
        email: testUtils.testUserEmail,
        password: newPassword,
      });
      
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.data.tokens.accessToken).toBeDefined();
  });
}); 
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { AuthController } from '../auth.controller.js';
import { UsersController } from '../users.controller.js';

describe('UsersController', () => {
	let testAgent: any;
	let authController: AuthController;
	let usersController: UsersController;
	
	beforeAll(async () => {
		const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;

		// Need to initialize AuthController in order to login with test user - needed for any endpoints that require authentication
		authController = new AuthController(testSetup.app, testSetup.db);
    usersController = new UsersController(testSetup.app, testSetup.db);
  
    // Setup error handling middleware AFTER controller initialization
    await TestExpressApp.setupErrorHandling();
    
    // Set up test user data
    await testUtils.setupTestUser();
	});

	afterAll(async () => {
		await testUtils.deleteTestUser()
		await TestExpressApp.cleanup();
	});

	describe('GET /users', () => {
		const apiEndpoint = `/api/users/${testUtils.testUserId}`;

		it('should not return any sensitive information for a user', async () => {
			const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);
			
			const response = await testAgent
				.get(apiEndpoint)
				.set('Authorization', authorizationHeaderValue)
				.expect(200);

			expect(response.body?.data?.email).toEqual(testUtils.testUserEmail);
			expect(response.body?.data?.password).toBeUndefined();
		});
	});
});


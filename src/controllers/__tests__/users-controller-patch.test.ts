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
		const testSetup = await TestExpressApp.init();
		testAgent = testSetup.agent;

		// Need to initialize AuthController in order to login with test user - needed for any endpoints that require authentication
		authController = new AuthController(testSetup.app, testSetup.database);
		usersController = new UsersController(testSetup.app, testSetup.database);

		// Setup error handling middleware AFTER controller initialization
		await TestExpressApp.setupErrorHandling();

		// Set up test user data
		await testUtils.setupTestUser();
	});

	afterAll(async () => {
		await testUtils.deleteTestUser()
		await TestExpressApp.cleanup();
	});

	describe('PATCH /users', () => {
		const apiEndpoint = '/api/users';

		it("should return a 200 and only update provided properties", async () => {
			const authorizationHeaderValue = await testUtils.loginWithTestUser(testAgent);

			const path = `${apiEndpoint}/${getTestMetaOrgUser()._id}`;
			const updatedRole = 'admin';
			const updatedUser = {
				roles: [updatedRole]
			};

			const response = await testAgent
				.patch(path)
				.set('Authorization', authorizationHeaderValue)
				.send(updatedUser)
				.expect(200);

			expect(response.body?.data?.roles).toEqual([updatedRole]);
			expect(response.body?.data?.email).toEqual(getTestMetaOrgUser().email); // because this is partial update, properties we did not provide should remain the same
		});
	});

});



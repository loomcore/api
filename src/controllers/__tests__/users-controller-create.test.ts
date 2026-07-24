import type { IUser } from "@loomcore/common/models";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import testUtils from "../../__tests__/common-test.utils.js";
import { TestExpressApp } from "../../__tests__/test-express-app.js";
import { getTestMetaOrgUser } from "../../__tests__/test-objects.js";
import { AuthController } from "../auth.controller.js";
import { UsersController } from "../users.controller.js";

describe("UsersController", () => {
	let testAgent: any;
	let authController: AuthController;
	let usersController: UsersController;

	beforeAll(async () => {
		const testSetup = await TestExpressApp.init();
		testAgent = testSetup.agent;

		authController = new AuthController(testSetup.app, testSetup.database);
		usersController = new UsersController(testSetup.app, testSetup.database);

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

	describe("POST /users", () => {
		const apiEndpoint = "/api/users";

		it("should allow an authenticated non-admin to create a user", async () => {
			const authorizationHeaderValue =
				await testUtils.loginWithTestUser(testAgent);

			const newUser: Partial<IUser> = {
				_orgId: getTestMetaOrgUser()._orgId,
				email: testUtils.newUser1Email,
				password: testUtils.newUser1Password,
			};

			const response = await testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send(newUser);

			expect(response.status).toBe(201);
			expect(response.body?.data?.email).toBe(testUtils.newUser1Email);
		});
	});
});

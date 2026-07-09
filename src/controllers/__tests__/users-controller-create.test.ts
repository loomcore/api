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

		it("should return a 201 and a newly created user on successful creation", async () => {
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
			expect(response.body?.data).toHaveProperty("_id");
			expect(response.body?.data).toHaveProperty("email", newUser.email);
			expect(response.body?.data).toHaveProperty(
				"_orgId",
				getTestMetaOrgUser()._orgId,
			);
		});

		it("should return a 400 with an invalid email", async () => {
			const authorizationHeaderValue =
				await testUtils.loginWithTestUser(testAgent);

			const newUser = {
				email: "test",
				password: testUtils.newUser1Password,
				_orgId: getTestMetaOrgUser()._orgId,
			};

			return testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send(newUser)
				.expect(400);
		});

		it("should return a 400 with an invalid password", async () => {
			const authorizationHeaderValue =
				await testUtils.loginWithTestUser(testAgent);

			const newUser = {
				email: testUtils.newUser1Email,
				password: "t",
				_orgId: getTestMetaOrgUser()._orgId,
			};

			return testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send(newUser)
				.expect(400);
		});

		it("should return a 400 with missing email or password", async () => {
			const authorizationHeaderValue =
				await testUtils.loginWithTestUser(testAgent);

			await testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send({
					email: "shouldfail@test.com",
					_orgId: getTestMetaOrgUser()._orgId,
				})
				.expect(400);

			await testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send({
					password: "shouldfail",
					_orgId: getTestMetaOrgUser()._orgId,
				})
				.expect(400);
		});

		it("should return a 400 if user with duplicate email already exists", async () => {
			const authorizationHeaderValue =
				await testUtils.loginWithTestUser(testAgent);

			const newUser = {
				email: getTestMetaOrgUser().email,
				password: getTestMetaOrgUser().password,
				_orgId: getTestMetaOrgUser()._orgId,
			};

			return testAgent
				.post(apiEndpoint)
				.set("Authorization", authorizationHeaderValue)
				.send(newUser)
				.expect(400);
		});
	});
});

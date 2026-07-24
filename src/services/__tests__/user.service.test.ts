import type { IQueryOptions } from "@loomcore/common/models";
import { initializeTypeBox } from "@loomcore/common/validation";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import testUtils from "../../__tests__/common-test.utils.js";
import { TestExpressApp } from "../../__tests__/test-express-app.js";
import {
	getTestMetaOrgAdminUserContext,
	getTestMetaOrgUser,
	getTestMetaOrgUserContext,
	getTestOrgUser,
} from "../../__tests__/test-objects.js";
import { BadRequestError, ServerError, UnauthorizedError } from "../../errors/index.js";
import { passwordUtils } from "../../utils/password.utils.js";
import { UserService } from "../user.service.js";

const AUTH_CHANGE_PASSWORD_MESSAGE =
	"Use auth change password endpoint to update password.";
const OWN_PASSWORD_ONLY_MESSAGE = "You can only update your own password.";
const EMPTY_PASSWORD_MESSAGE = "Password cannot be empty.";

beforeAll(() => {
	initializeTypeBox();
});

describe("UserService", () => {
	let service: UserService;

	beforeAll(async () => {
		const setup = await TestExpressApp.init();
		testUtils.initialize(setup.database);
		service = new UserService(setup.database);
	});

	afterAll(async () => {
		await testUtils.cleanup();
		await TestExpressApp.cleanup();
	});

	beforeEach(async () => {
		await TestExpressApp.clearCollections();
		await testUtils.setupTestUsers();
	});

	describe("getById", () => {
		it("should allow a user to get themselves", async () => {
			const user = await service.getById(
				getTestMetaOrgUserContext(),
				getTestMetaOrgUser()._id,
			);

			expect(user._id).toEqual(getTestMetaOrgUser()._id);
		});

		it("should reject getting another user for non-admins", async () => {
			await expect(
				service.getById(
					getTestMetaOrgUserContext(),
					getTestOrgUser()._id,
				),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should allow admins to get another user", async () => {
			const created = await service.create(
				getTestMetaOrgAdminUserContext(),
				{
					email: "another-meta-user@example.com",
					displayName: "Another Meta User",
					password: "password123!",
					externalId: "another-meta-user",
				},
			);
			expect(created).toBeTruthy();

			const user = await service.getById(
				getTestMetaOrgAdminUserContext(),
				created!._id,
			);

			expect(user._id).toEqual(created!._id);
		});
	});

	describe("get / getAll / getCount", () => {
		it("should reject get from non-admin users", async () => {
			await expect(
				service.get(getTestMetaOrgUserContext()),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should reject getAll from non-admin users", async () => {
			await expect(
				service.getAll(getTestMetaOrgUserContext()),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should reject getCount from non-admin users", async () => {
			await expect(
				service.getCount(getTestMetaOrgUserContext()),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should allow admins to get, getAll, and getCount", async () => {
			const adminContext = getTestMetaOrgAdminUserContext();

			const paged = await service.get(adminContext);
			expect(paged.entities.length).toBeGreaterThan(0);

			const all = await service.getAll(adminContext);
			expect(all.length).toBeGreaterThan(0);

			const count = await service.getCount(adminContext);
			expect(count).toBeGreaterThan(0);
		});
	});

	describe("update", () => {
		it("should reject updates from non-admin users", async () => {
			const queryObject: IQueryOptions = {
				filters: { _id: { eq: getTestMetaOrgUser()._id } },
			};

			await expect(
				service.update(getTestMetaOrgUserContext(), queryObject, {
					displayName: "Updated Display Name",
				}),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should reject admin updates that include a password", async () => {
			const queryObject: IQueryOptions = {
				filters: { _id: { eq: getTestMetaOrgUser()._id } },
			};

			await expect(
				service.update(getTestMetaOrgAdminUserContext(), queryObject, {
					password: "new-password",
				}),
			).rejects.toThrow(ServerError);

			await expect(
				service.update(getTestMetaOrgAdminUserContext(), queryObject, {
					password: "new-password",
				}),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should allow admin updates that do not include a password", async () => {
			const queryObject: IQueryOptions = {
				filters: { _id: { eq: getTestMetaOrgUser()._id } },
			};

			const updatedUsers = await service.update(
				getTestMetaOrgAdminUserContext(),
				queryObject,
				{ displayName: "Updated Display Name" },
			);

			expect(updatedUsers).toHaveLength(1);
			expect(updatedUsers[0].displayName).toBe("Updated Display Name");
		});
	});

	describe("batchUpdate", () => {
		it("should reject batch updates from non-admin users", async () => {
			await expect(
				service.batchUpdate(getTestMetaOrgUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						displayName: "Updated Meta Org User",
					},
				]),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should reject batch updates when any entity includes a password", async () => {
			await expect(
				service.batchUpdate(getTestMetaOrgAdminUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(ServerError);

			await expect(
				service.batchUpdate(getTestMetaOrgAdminUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should reject batch updates when only one entity in the batch includes a password", async () => {
			await expect(
				service.batchUpdate(getTestMetaOrgAdminUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						displayName: "Updated Meta Org User",
					},
					{
						_id: getTestOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(ServerError);

			await expect(
				service.batchUpdate(getTestMetaOrgAdminUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						displayName: "Updated Meta Org User",
					},
					{
						_id: getTestOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should allow batch updates when no entities include a password", async () => {
			const updatedUsers = await service.batchUpdate(
				getTestMetaOrgAdminUserContext(),
				[
					{
						_id: getTestMetaOrgUser()._id,
						displayName: "Updated Meta Org User",
					},
				],
			);

			expect(updatedUsers).toHaveLength(1);
			expect(updatedUsers[0].displayName).toBe("Updated Meta Org User");
		});
	});

	describe("partialUpdateById", () => {
		it("should reject password updates when allowPasswordUpdate is false", async () => {
			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestMetaOrgUser()._id,
					{ password: "new-password" },
				),
			).rejects.toThrow(ServerError);

			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestMetaOrgUser()._id,
					{ password: "new-password" },
				),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should reject password updates for another user when allowPasswordUpdate is true", async () => {
			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestOrgUser()._id,
					{ password: "new-password" },
					true,
				),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should reject empty string passwords when allowPasswordUpdate is true", async () => {
			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestMetaOrgUser()._id,
					{ password: "" },
					true,
				),
			).rejects.toThrow(BadRequestError);

			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestMetaOrgUser()._id,
					{ password: "" },
					true,
				),
			).rejects.toThrow(EMPTY_PASSWORD_MESSAGE);
		});

		it("should allow password updates for the current user when allowPasswordUpdate is true", async () => {
			const newPassword = "newSecurePassword123!";

			const updatedUser = await service.partialUpdateById(
				getTestMetaOrgUserContext(),
				getTestMetaOrgUser()._id,
				{ password: newPassword },
				true,
			);

			expect(updatedUser.password).toBeDefined();
			expect(updatedUser.password).not.toEqual(newPassword);

			const isPasswordCorrect = await passwordUtils.comparePasswords(
				updatedUser.password ?? "",
				newPassword,
			);
			expect(isPasswordCorrect).toBe(true);
		});

		it("should allow partial updates that do not include a password", async () => {
			const updatedUser = await service.partialUpdateById(
				getTestMetaOrgUserContext(),
				getTestMetaOrgUser()._id,
				{ displayName: "Updated Display Name" },
			);

			expect(updatedUser.displayName).toBe("Updated Display Name");
		});

		it("should reject partial updates of another user for non-admins", async () => {
			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestOrgUser()._id,
					{ displayName: "Hijacked" },
				),
			).rejects.toThrow(UnauthorizedError);
		});

		it("should allow admins to partial update another user", async () => {
			const updatedUser = await service.partialUpdateById(
				getTestMetaOrgAdminUserContext(),
				getTestOrgUser()._id,
				{ displayName: "Admin Updated" },
			);

			expect(updatedUser.displayName).toBe("Admin Updated");
		});
	});
});

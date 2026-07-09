import type { IQueryOptions } from "@loomcore/common/models";
import { initializeTypeBox } from "@loomcore/common/validation";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import testUtils from "../../__tests__/common-test.utils.js";
import { TestExpressApp } from "../../__tests__/test-express-app.js";
import {
	getTestMetaOrgUser,
	getTestMetaOrgUserContext,
	getTestOrgUser,
} from "../../__tests__/test-objects.js";
import { BadRequestError, ServerError } from "../../errors/index.js";
import { passwordUtils } from "../../utils/password.utils.js";
import { UserService } from "../user.service.js";

const AUTH_CHANGE_PASSWORD_MESSAGE =
	"Use auth change password endpoint to update password.";
const OWN_PASSWORD_ONLY_MESSAGE = "You can only update your own password.";
const EMPTY_PASSWORD_MESSAGE = "Password cannot be empty.";

beforeAll(() => {
	initializeTypeBox();
});

describe("UserService - password change blocking", () => {
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

	describe("update", () => {
		it("should reject updates that include a password", async () => {
			const queryObject: IQueryOptions = {
				filters: { _id: { eq: getTestMetaOrgUser()._id } },
			};

			await expect(
				service.update(getTestMetaOrgUserContext(), queryObject, {
					password: "new-password",
				}),
			).rejects.toThrow(ServerError);

			await expect(
				service.update(getTestMetaOrgUserContext(), queryObject, {
					password: "new-password",
				}),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should allow updates that do not include a password", async () => {
			const queryObject: IQueryOptions = {
				filters: { _id: { eq: getTestMetaOrgUser()._id } },
			};

			const updatedUsers = await service.update(
				getTestMetaOrgUserContext(),
				queryObject,
				{ displayName: "Updated Display Name" },
			);

			expect(updatedUsers).toHaveLength(1);
			expect(updatedUsers[0].displayName).toBe("Updated Display Name");
		});
	});

	describe("batchUpdate", () => {
		it("should reject batch updates when any entity includes a password", async () => {
			await expect(
				service.batchUpdate(getTestMetaOrgUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(ServerError);

			await expect(
				service.batchUpdate(getTestMetaOrgUserContext(), [
					{
						_id: getTestMetaOrgUser()._id,
						password: "new-password",
					},
				]),
			).rejects.toThrow(AUTH_CHANGE_PASSWORD_MESSAGE);
		});

		it("should reject batch updates when only one entity in the batch includes a password", async () => {
			await expect(
				service.batchUpdate(getTestMetaOrgUserContext(), [
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
				service.batchUpdate(getTestMetaOrgUserContext(), [
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
				getTestMetaOrgUserContext(),
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
			).rejects.toThrow(ServerError);

			await expect(
				service.partialUpdateById(
					getTestMetaOrgUserContext(),
					getTestOrgUser()._id,
					{ password: "new-password" },
					true,
				),
			).rejects.toThrow(OWN_PASSWORD_ONLY_MESSAGE);
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
	});
});

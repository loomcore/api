import { UserSpec } from "@loomcore/common/models";
import { Type } from "@sinclair/typebox";
import { entityUtils } from "@loomcore/common/utils";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { UserService } from "../../services/user.service.js";
import {
	getAuthUserContextSpec,
	resetAuthUserContextSpec,
} from "../../utils/auth/index.js";
import { AuthController } from "../auth.controller.js";

describe("AuthController extended user JWT registration", () => {
	afterEach(() => {
		resetAuthUserContextSpec();
	});

	function buildExtendedUserSpecs() {
		const ExtendedUserSchema = Type.Intersect([
			UserSpec.schema,
			Type.Object({
				employeeId: Type.Optional(Type.String()),
			}),
		]);
		const ExtendedUserSpec = entityUtils.getModelSpec(ExtendedUserSchema, {
			isAuditable: true,
		});
		const ExtendedPublicUserSchema = Type.Omit(ExtendedUserSchema, [
			"password",
		]);
		const ExtendedPublicUserSpec = entityUtils.getModelSpec(
			ExtendedPublicUserSchema,
			{ isAuditable: true },
		);
		return { ExtendedUserSpec, ExtendedPublicUserSpec };
	}

	const jwtPayload = {
		user: {
			_id: "507f1f77bcf86cd799439011",
			email: "test@example.com",
			password: "hashed",
			employeeId: "E-123",
			_created: "2024-01-01T00:00:00.000Z",
			_createdBy: "507f1f77bcf86cd799439011",
		},
		authorizations: [],
		organization: {
			_id: "507f1f77bcf86cd799439012",
			name: "Test Org",
			code: "test",
			_created: "2024-01-01T00:00:00.000Z",
			_createdBy: "507f1f77bcf86cd799439011",
		},
	};

	it("registers JWT decode from userService modelSpec when userSpec is omitted", () => {
		const { ExtendedUserSpec, ExtendedPublicUserSpec } =
			buildExtendedUserSpecs();
		const app = express();
		const database = {} as any;
		const userService = new UserService(database, ExtendedUserSpec);

		new AuthController(app, database, {
			userService,
			publicUserSpec: ExtendedPublicUserSpec,
		});

		const decoded = getAuthUserContextSpec().decode(jwtPayload) as {
			user: { employeeId?: string };
		};
		expect(decoded.user.employeeId).toBe("E-123");
	});

	it("registers JWT decode from publicUserSpec when that is the only host extension", () => {
		const { ExtendedPublicUserSpec } = buildExtendedUserSpecs();
		const app = express();
		const database = {} as any;

		new AuthController(app, database, {
			publicUserSpec: ExtendedPublicUserSpec,
		});

		const decoded = getAuthUserContextSpec().decode(jwtPayload) as {
			user: { employeeId?: string; password?: string };
		};
		expect(decoded.user.employeeId).toBe("E-123");
		expect(decoded.user.password).toBeUndefined();
	});
});

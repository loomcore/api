import {
	PublicUserSpec,
	UserSpec,
	UserContextSpec,
} from "@loomcore/common/models";
import { Type } from "@sinclair/typebox";
import { entityUtils } from "@loomcore/common/utils";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLoginResponseSpec,
	createUserContextSpec,
	getAuthUserContextSpec,
	resetAuthUserContextSpec,
	setAuthUserContextSpec,
} from "../auth-user-specs.util.js";

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
	const ExtendedPublicUserSchema = Type.Omit(ExtendedUserSchema, ["password"]);
	const ExtendedPublicUserSpec = entityUtils.getModelSpec(
		ExtendedPublicUserSchema,
		{ isAuditable: true },
	);
	return { ExtendedUserSpec, ExtendedPublicUserSpec };
}

describe("auth-user-specs", () => {
	afterEach(() => {
		resetAuthUserContextSpec();
	});

	it("preserves extended user fields when encoding/decoding with a custom user context spec", () => {
		const { ExtendedUserSpec, ExtendedPublicUserSpec } =
			buildExtendedUserSpecs();

		const publicUserContextSpec = createUserContextSpec(
			ExtendedPublicUserSpec,
		);
		const jwtUserContextSpec = createUserContextSpec(ExtendedUserSpec);

		const userContext = {
			user: {
				_id: "507f1f77bcf86cd799439011",
				email: "test@example.com",
				password: "hashed",
				employeeId: "E-123",
				_created: new Date("2024-01-01T00:00:00.000Z"),
				_createdBy: "507f1f77bcf86cd799439011",
			},
			authorizations: [],
			organization: {
				_id: "507f1f77bcf86cd799439012",
				name: "Test Org",
				code: "test",
				_created: new Date("2024-01-01T00:00:00.000Z"),
				_createdBy: "507f1f77bcf86cd799439011",
			},
		};

		const defaultDecoded = UserContextSpec.decode(
			UserContextSpec.encode(userContext),
		) as typeof userContext;
		expect((defaultDecoded.user as any).employeeId).toBeUndefined();

		const customDecoded = jwtUserContextSpec.decode(
			jwtUserContextSpec.encode(userContext),
		) as typeof userContext;
		expect(customDecoded.user.employeeId).toBe("E-123");

		const publicEncoded = publicUserContextSpec.encode(userContext);
		expect(publicEncoded.user.employeeId).toBe("E-123");
		expect(publicEncoded.user.password).toBeUndefined();

		const loginResponseSpec = createLoginResponseSpec(publicUserContextSpec);
		const loginEncoded = loginResponseSpec.encode({
			tokens: {
				accessToken: "a",
				refreshToken: "r",
				expiresOn: 1,
			},
			userContext,
		});
		expect(loginEncoded.userContext.user.employeeId).toBe("E-123");
		expect(loginEncoded.userContext.user.password).toBeUndefined();
	});

	it("registers and resets the JWT user context spec used by isAuthorized", () => {
		expect(getAuthUserContextSpec()).toBe(UserContextSpec);

		const custom = createUserContextSpec(PublicUserSpec);
		setAuthUserContextSpec(custom);
		expect(getAuthUserContextSpec()).toBe(custom);

		resetAuthUserContextSpec();
		expect(getAuthUserContextSpec()).toBe(UserContextSpec);
	});

	it("preserves extended fields when JWT decode is registered from publicUserSpec alone", () => {
		const { ExtendedPublicUserSpec } = buildExtendedUserSpecs();
		setAuthUserContextSpec(createUserContextSpec(ExtendedPublicUserSpec));

		const payload = {
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

		const decoded = getAuthUserContextSpec().decode(payload) as {
			user: { employeeId?: string; password?: string };
		};
		expect(decoded.user.employeeId).toBe("E-123");
		expect(decoded.user.password).toBeUndefined();
	});
});

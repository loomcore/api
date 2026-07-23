import {
	type IModelSpec,
	OrganizationSpec,
	PublicUserSpec,
	TokenResponseSchema,
	UserContextAuthorizationSpec,
	UserContextSpec,
	UserSpec,
} from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

/**
 * Builds a UserContext model spec whose `user` field uses the provided user model spec.
 * Use the full user spec (including password) for JWT encode/decode, and the public
 * user spec for API responses.
 */
export function createUserContextSpec(userModelSpec: IModelSpec): IModelSpec {
	return entityUtils.getModelSpec(
		Type.Object({
			user: userModelSpec.fullSchema,
			authorizations: Type.Array(UserContextAuthorizationSpec.fullSchema),
			organization: OrganizationSpec.fullSchema,
		}),
		{ isEntity: false },
	);
}

/**
 * Builds a LoginResponse model spec whose nested userContext uses the provided
 * public user context spec.
 */
export function createLoginResponseSpec(
	publicUserContextSpec: IModelSpec,
): IModelSpec {
	return entityUtils.getModelSpec(
		Type.Object({
			tokens: TokenResponseSchema,
			userContext: publicUserContextSpec.fullSchema,
		}),
		{ isEntity: false },
	);
}

let authUserContextSpec: IModelSpec = UserContextSpec;

/**
 * Registers the UserContext spec used when decoding JWTs in `isAuthorized`.
 * Call at app startup (or via AuthController options) when using an extended IUser.
 */
export function setAuthUserContextSpec(spec: IModelSpec): void {
	authUserContextSpec = spec;
}

export function getAuthUserContextSpec(): IModelSpec {
	return authUserContextSpec;
}

/** Resets JWT UserContext spec to the default loomcore spec (for tests). */
export function resetAuthUserContextSpec(): void {
	authUserContextSpec = UserContextSpec;
}

export function resolveAuthUserSpecs(options: {
	userSpec?: IModelSpec;
	publicUserSpec?: IModelSpec;
}): {
	userSpec: IModelSpec;
	publicUserSpec: IModelSpec;
	publicUserContextSpec: IModelSpec;
	loginResponseSpec: IModelSpec;
} {
	const userSpec = options.userSpec ?? UserSpec;
	const publicUserSpec = options.publicUserSpec ?? PublicUserSpec;
	const publicUserContextSpec = createUserContextSpec(publicUserSpec);
	const loginResponseSpec = createLoginResponseSpec(publicUserContextSpec);

	return {
		userSpec,
		publicUserSpec,
		publicUserContextSpec,
		loginResponseSpec,
	};
}

import {
	type IModelSpec,
	TokenResponseSchema,
	UserContextSpec,
} from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import { Type } from "@sinclair/typebox";

export function createLoginResponseSpec(
	userContextSpec: IModelSpec,
): IModelSpec {
	authUserContextSpec = userContextSpec;
	return entityUtils.getModelSpec(
		Type.Object({
			tokens: TokenResponseSchema,
			userContext: userContextSpec.fullSchema,
		}),
		{ isEntity: false },
	);
}

let authUserContextSpec: IModelSpec = UserContextSpec;

export function getAuthUserContextSpec(): IModelSpec {
	return authUserContextSpec;
}

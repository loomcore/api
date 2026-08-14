import {
	getSystemUserContext,
	IQueryOptions,
	type ITokenResponse,
	type IUserContext,
} from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { AuthorizationsService } from "../../services/authorizations.service.js";
import { UserService } from "../../services/user.service.js";
import { createNewTokens } from "./create-new-tokens.util.js";
import { getActiveRefreshToken } from "./get-active-refresh-token.util.js";
import { BadRequestError } from "../../errors/index.js";

export async function requestTokenUsingRefreshToken(
	database: IDatabase,
	refreshToken: string,
	deviceId: string,
	userService: UserService = new UserService(database),
	authorizationsService: AuthorizationsService = new AuthorizationsService(
		database,
	),
): Promise<ITokenResponse | null> {
	const systemUserContext = getSystemUserContext();
	const activeRefreshToken = await getActiveRefreshToken(
		database,
		systemUserContext,
		refreshToken,
		deviceId,
	);

	if (!activeRefreshToken) {
		return null;
	}

	let userQueryOptions: IQueryOptions = {
		filters: { _id: { eq: activeRefreshToken.userId } },
	};
	const user = await userService.findOne(systemUserContext, userQueryOptions);
	if (!user) {
		throw new BadRequestError("User not found");
	}

	const features = await authorizationsService.getUserContextFeatures(user);
	const userContext: IUserContext = {
		user,
		features,
	};

	return createNewTokens(userContext, activeRefreshToken);
}

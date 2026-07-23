import type { ITokenResponse, IUserContext } from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import type { UserService } from "../../services/user.service.js";
import { generateJwt } from "../jwt.utils.js";
import { createNewRefreshToken } from "./create-new-refresh-token.util.js";
import { getAuthConfig } from "./get-auth-config.util.js";
import { getExpiresOnFromSeconds } from "./get-expires-on-from-seconds.util.js";
import { updateLastLoggedIn } from "./update-last-logged-in.util.js";

export async function logUserIn(
	database: IDatabase,
	userContext: IUserContext,
	deviceId: string,
	userService?: UserService,
): Promise<ITokenResponse> {
	const authConfig = getAuthConfig();
	const accessToken = generateJwt(userContext);

	const refreshTokenObject = await createNewRefreshToken(
		database,
		userContext.user._id,
		deviceId,
		userContext.organization?._id,
	);
	const accessTokenExpiresOn = getExpiresOnFromSeconds(
		authConfig.jwtExpirationInSeconds,
	);

	const tokenResponse = {
		accessToken,
		refreshToken: refreshTokenObject.token,
		expiresOn: accessTokenExpiresOn,
	};

	updateLastLoggedIn(database, userContext.user._id, userService).catch(
		(err) => console.log(`Error updating lastLoggedIn: ${err}`),
	);

	return tokenResponse;
}

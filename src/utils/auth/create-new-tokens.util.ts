import type { ITokenResponse, IUserContext } from "@loomcore/common/models";
import type { IRefreshToken } from "../../models/refresh-token.model.js";
import { generateJwt } from "../jwt.utils.js";
import { getAuthConfig } from "./get-auth-config.util.js";
import { getExpiresOnFromSeconds } from "./get-expires-on-from-seconds.util.js";

export async function createNewTokens(
	userContext: IUserContext,
	activeRefreshToken: IRefreshToken,
): Promise<ITokenResponse> {
	const authConfig = getAuthConfig();
	const accessToken = generateJwt(userContext);
	const accessTokenExpiresOn = getExpiresOnFromSeconds(
		authConfig.jwtExpirationInSeconds,
	);

	return {
		accessToken,
		refreshToken: activeRefreshToken.token,
		expiresOn: accessTokenExpiresOn,
	};
}

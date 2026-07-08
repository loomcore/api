import type { ITokenResponse, IUserContext } from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { createNewTokens } from "./create-new-tokens.util.js";
import { getActiveRefreshToken } from "./get-active-refresh-token.util.js";

export async function requestTokenUsingRefreshToken(
	database: IDatabase,
	userContext: IUserContext,
	refreshToken: string,
	deviceId: string,
): Promise<ITokenResponse | null> {
	const activeRefreshToken = await getActiveRefreshToken(
		database,
		userContext,
		refreshToken,
		deviceId,
	);
	if (activeRefreshToken) {
		return createNewTokens(userContext, activeRefreshToken);
	}
	return null;
}

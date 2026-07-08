import type { IUserContext } from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import type { IRefreshToken } from "../../models/refresh-token.model.js";
import { RefreshTokenService } from "../../services/refresh-token.service.js";

export async function getActiveRefreshToken(
	database: IDatabase,
	userContext: IUserContext,
	refreshToken: string,
	deviceId: string,
): Promise<IRefreshToken | null> {
	const refreshTokenService = new RefreshTokenService(database);
	const refreshTokenResult = await refreshTokenService.findOne(userContext, {
		filters: {
			token: { eq: refreshToken },
			deviceId: { eq: deviceId },
		},
	});
	if (!refreshTokenResult) {
		return null;
	}

	const now = Date.now();
	const isExpired = refreshTokenResult.expiresOn < now;
	if (isExpired) {
		return null;
	}
	return refreshTokenResult;
}

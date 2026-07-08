import { getSystemUserContext } from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import moment from "moment";
import type { IDatabase } from "../../databases/models/index.js";
import { ServerError } from "../../errors/index.js";
import type { IRefreshToken } from "../../models/refresh-token.model.js";
import { RefreshTokenService } from "../../services/refresh-token.service.js";
import { generateRefreshToken } from "./generate-refresh-token.util.js";
import { getAuthConfig } from "./get-auth-config.util.js";
import { getExpiresOnFromDays } from "./get-expires-on-from-days.util.js";

export async function createNewRefreshToken(
	database: IDatabase,
	userId: AppIdType,
	deviceId: string,
	orgId?: AppIdType,
): Promise<IRefreshToken> {
	const authConfig = getAuthConfig();
	const expiresOn = getExpiresOnFromDays(
		authConfig.refreshTokenExpirationInDays,
	);

	const newRefreshToken: Partial<IRefreshToken> = {
		_orgId: orgId,
		token: generateRefreshToken(),
		deviceId,
		userId,
		expiresOn: expiresOn,
		created: moment().utc().toDate(),
		createdBy: userId,
	};

	const refreshTokenService = new RefreshTokenService(database);
	await refreshTokenService.deleteMany(getSystemUserContext(), {
		filters: { deviceId: { eq: deviceId } },
	});
	const insertResult = await refreshTokenService.create(
		getSystemUserContext(),
		newRefreshToken,
	);

	if (!insertResult) {
		throw new ServerError("Failed to create refresh token");
	}
	return insertResult;
}

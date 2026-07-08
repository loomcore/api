import type { IUserContext } from "@loomcore/common/models";
import jwt from "jsonwebtoken";
import { getAuthConfig } from "./auth/get-auth-config.util.js";

export function generateJwt(userContext: IUserContext) {
	const authConfig = getAuthConfig();
	const jwtExpiryConfig = authConfig.jwtExpirationInSeconds;
	const jwtExpirationInSeconds =
		typeof jwtExpiryConfig === "string"
			? Number.parseInt(jwtExpiryConfig, 10)
			: jwtExpiryConfig;

	return jwt.sign(userContext, authConfig.clientSecret, {
		expiresIn: jwtExpirationInSeconds,
	});
}

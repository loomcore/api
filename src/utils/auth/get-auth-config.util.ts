import { config } from "../../config/index.js";
import { ServerError } from "../../errors/index.js";
import type { IAuthConfig } from "../../models/auth-config.interface.js";

export function getAuthConfig(): IAuthConfig {
	if (!config.auth) {
		throw new ServerError("Auth configuration is not set");
	}
	return config.auth;
}

import type { IDatabase } from "../databases/models/index.js";
import {
	type IRefreshToken,
	refreshTokenModelSpec,
} from "../models/refresh-token.model.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";

export class RefreshTokenService extends MultiTenantApiService<IRefreshToken> {
	constructor(database: IDatabase) {
		super(database, "refresh_tokens", "refresh_token", refreshTokenModelSpec);
	}
}

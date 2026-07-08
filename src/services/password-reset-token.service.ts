import crypto from "node:crypto";
import {
	type IPasswordResetToken,
	type IUserContext,
	PasswordResetTokenSpec,
} from "@loomcore/common/models";
import type { IDatabase } from "../databases/models/index.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";

export class PasswordResetTokenService extends MultiTenantApiService<IPasswordResetToken> {
	constructor(database: IDatabase) {
		super(
			database,
			"password_reset_tokens",
			"password_reset_token",
			PasswordResetTokenSpec,
		);
	}

	async createPasswordResetToken(
		userContext: IUserContext,
		email: string,
		expiresOn: number,
	): Promise<IPasswordResetToken | null> {
		const lowerCaseEmail = email.toLowerCase();
		await this.deleteMany(userContext, {
			filters: { email: { eq: lowerCaseEmail } },
		});

		const passwordResetToken: Partial<IPasswordResetToken> = {
			email: lowerCaseEmail,
			token: crypto.randomBytes(40).toString("hex"),
			expiresOn: expiresOn,
		};

		return super.create(userContext, passwordResetToken);
	}
}

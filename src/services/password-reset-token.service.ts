import crypto from "node:crypto";
import {
	getSystemUserContext,
	type IPasswordResetToken,
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
		email: string,
		expiresOn: number,
	): Promise<IPasswordResetToken | null> {
		const lowerCaseEmail = email.toLowerCase();
		await this.deleteMany(getSystemUserContext(), {
			filters: { email: { eq: lowerCaseEmail } },
		});

		const passwordResetToken: Partial<IPasswordResetToken> = {
			email: lowerCaseEmail,
			token: crypto.randomBytes(40).toString("hex"),
			expiresOn: expiresOn,
		};

		return super.create(getSystemUserContext(), passwordResetToken);
	}

	async getByEmail(email: string): Promise<IPasswordResetToken | null> {
		return await super.findOne(getSystemUserContext(), {
			filters: { email: { eq: email.toLowerCase() } },
		});
	}
}

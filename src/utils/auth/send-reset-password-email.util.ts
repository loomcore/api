import {
	EmptyUserContext,
	type IUserContext,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import type { IDatabase } from "../../databases/models/index.js";
import { ServerError } from "../../errors/index.js";
import { EmailService } from "../../services/email.service.js";
import { OrganizationService } from "../../services/organization.service.js";
import { PasswordResetTokenService } from "../../services/password-reset-token.service.js";
import { getAuthConfig } from "./get-auth-config.util.js";
import { getExpiresOnFromMinutes } from "./get-expires-on-from-minutes.util.js";

export async function sendResetPasswordEmail(
	database: IDatabase,
	emailAddress: string,
	clientBaseUrl: string,
	organizationId?: AppIdType,
) {
	const authConfig = getAuthConfig();
	const organizationService = new OrganizationService(database);
	const passwordResetTokenService = new PasswordResetTokenService(database);
	const emailService = new EmailService();

	const organization = organizationId
		? await organizationService.findOne(EmptyUserContext, {
				filters: { _id: { eq: organizationId } },
			})
		: null;
	const userContext: IUserContext = {
		...EmptyUserContext,
		organization: organization ?? undefined,
	};

	const expiresOn = getExpiresOnFromMinutes(
		authConfig.passwordResetTokenExpirationInMinutes,
	);
	const passwordResetToken =
		await passwordResetTokenService.createPasswordResetToken(
			userContext,
			emailAddress,
			expiresOn,
		);

	if (!passwordResetToken) {
		throw new ServerError(
			`Failed to create password reset token for email: ${emailAddress}`,
		);
	}

	const urlEncodedEmail = encodeURIComponent(emailAddress);
	const resetPasswordLink = `${clientBaseUrl}/reset-password/${passwordResetToken.token}/${urlEncodedEmail}`;

	await emailService.sendResetPasswordEmail(emailAddress, resetPasswordLink);
}

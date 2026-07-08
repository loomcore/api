import {
	EmptyUserContext,
	type IUserContext,
	passwordValidator,
	UserSpec,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import { entityUtils } from "@loomcore/common/utils";
import { config } from "../../config/base-api-config.js";
import type { IDatabase } from "../../databases/models/index.js";
import type { UpdateResult } from "../../databases/models/update-result.js";
import { BadRequestError, ServerError } from "../../errors/index.js";
import { OrganizationService } from "../../services/organization.service.js";
import { PasswordResetTokenService } from "../../services/password-reset-token.service.js";
import { UserService } from "../../services/user.service.js";
import { changePassword } from "./change-password.util.js";

export async function resetPassword(
	database: IDatabase,
	email: string,
	passwordResetToken: string,
	password: string,
	organizationId?: AppIdType,
): Promise<UpdateResult> {
	const validationErrors = entityUtils.validate(
		UserSpec,
		{ password: password },
		true,
		passwordValidator,
	);
	entityUtils.handleValidationResult(
		validationErrors,
		"AuthService.resetPassword",
	);

	if (config.app.isMultiTenant && !organizationId) {
		throw new BadRequestError(
			"Missing required fields: organizationId is required.",
		);
	}

	const lowerCaseEmail = email.toLowerCase();
	const organizationService = new OrganizationService(database);
	const passwordResetTokenService = new PasswordResetTokenService(database);
	const userService = new UserService(database);

	const organization = organizationId
		? await organizationService.findOne(EmptyUserContext, {
				filters: { _id: { eq: organizationId } },
			})
		: null;
	const userContext: IUserContext = {
		...EmptyUserContext,
		organization: organization ?? undefined,
	};

	const retrievedPasswordResetToken = await passwordResetTokenService.findOne(
		userContext,
		{
			filters: { email: { eq: lowerCaseEmail } },
		},
	);

	if (!retrievedPasswordResetToken) {
		throw new ServerError(
			`Unable to retrieve password reset token for email: ${lowerCaseEmail}`,
		);
	}

	if (
		retrievedPasswordResetToken.token !== passwordResetToken ||
		retrievedPasswordResetToken.expiresOn < Date.now()
	) {
		throw new BadRequestError("Invalid password reset token");
	}

	const user = await userService.findOne(userContext, {
		filters: { email: { eq: lowerCaseEmail } },
	});

	if (!user) {
		throw new ServerError(
			`Unable to retrieve user for email: ${lowerCaseEmail}`,
		);
	}

	userContext.user = user;

	const result = await changePassword(database, userContext, password);
	console.log(
		`password changed using forgot-password for email: ${lowerCaseEmail}`,
	);

	await passwordResetTokenService.deleteById(
		userContext,
		retrievedPasswordResetToken._id,
	);
	console.log(`passwordResetToken deleted for email: ${lowerCaseEmail}`);

	return result;
}

import {
	EmptyUserContext,
	type ILoginResponse,
	type IUserContext,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import type { IDatabase } from "../../databases/models/index.js";
import { BadRequestError } from "../../errors/index.js";
import { OrganizationService } from "../../services/organization.service.js";
import { UserService } from "../../services/user.service.js";
import { getUserContextAuthorizations } from "../../services/utils/getUserContextAuthorizations.util.js";
import { passwordUtils } from "../password.utils.js";
import { logUserIn } from "./log-user-in.util.js";

export async function attemptLogin(
	database: IDatabase,
	email: string,
	password: string,
	deviceId: string,
	organizationId?: AppIdType,
): Promise<ILoginResponse | null> {
	const organizationService = new OrganizationService(database);
	const organization = organizationId
		? await organizationService.findOne(EmptyUserContext, {
				filters: { _id: { eq: organizationId } },
			})
		: null;

	if (organizationId && !organization) {
		throw new BadRequestError("Invalid Credentials");
	}

	const lowerCaseEmail = email.toLowerCase();
	const userContext: IUserContext = {
		...EmptyUserContext,
		organization: organization ?? undefined,
	};
	const userService = new UserService(database);
	const user = await userService.findOne(userContext, {
		filters: {
			email: { eq: lowerCaseEmail },
		},
	});
	if (!user) {
		throw new BadRequestError("Invalid Credentials");
	}

	const passwordsMatch = await passwordUtils.comparePasswords(
		user.password,
		password,
	);
	if (!passwordsMatch) {
		throw new BadRequestError("Invalid Credentials");
	}

	const authorizations = await getUserContextAuthorizations(database, user);
	const authenticatedUserContext: IUserContext = {
		user: user,
		organization: organization ?? undefined,
		authorizations: authorizations,
	};
	const tokens = await logUserIn(database, authenticatedUserContext, deviceId);
	return {
		tokens,
		userContext: authenticatedUserContext,
	};
}

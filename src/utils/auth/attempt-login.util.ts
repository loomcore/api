import {
	EmptyUserContext,
	type ILoginResponse,
	type IOrganization,
	type IUserContext,
} from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { BadRequestError } from "../../errors/index.js";
import { UserService } from "../../services/user.service.js";
import { getUserContextAuthorizations } from "../../services/utils/getUserContextAuthorizations.util.js";
import { passwordUtils } from "../password.utils.js";
import { logUserIn } from "./log-user-in.util.js";

export async function attemptLogin(
	database: IDatabase,
	email: string,
	password: string,
	deviceId: string,
	organization: IOrganization | null,
): Promise<ILoginResponse | null> {
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

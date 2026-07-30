import {
	EmptyUserContext,
	type ILoginResponse,
	type IOrganization,
	type IUserContext,
} from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { BadRequestError } from "../../errors/index.js";
import { UserService } from "../../services/user.service.js";
import { passwordUtils } from "../password.utils.js";
import { logUserIn } from "./log-user-in.util.js";
import { getUserContextFeatures } from "../../services/utils/getUserContextAuthorizations.util.js";

export async function attemptLogin(
	database: IDatabase,
	email: string,
	password: string,
	deviceId: string,
	organization: IOrganization | null,
	userService: UserService = new UserService(database),
): Promise<ILoginResponse> {
	const lowerCaseEmail = email.toLowerCase();
	const userContext: IUserContext = {
		...EmptyUserContext,
		organization: organization ?? undefined,
	};
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

	const features = await getUserContextFeatures(database, user);
	const authenticatedUserContext: IUserContext = {
		user: user,
		organization: organization ?? undefined,
		features: features,
	};
	const tokens = await logUserIn(
		database,
		authenticatedUserContext,
		deviceId,
		userService,
	);
	return {
		tokens,
		userContext: authenticatedUserContext,
	};
}

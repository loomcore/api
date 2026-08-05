import {
	getSystemUserContext,
	IOrganization,
	IQueryOptions,
	type ITokenResponse,
	type IUserContext,
} from "@loomcore/common/models";
import type { IDatabase } from "../../databases/models/index.js";
import { AuthorizationsService } from "../../services/authorizations.service.js";
import { OrganizationService } from "../../services/organization.service.js";
import { UserService } from "../../services/user.service.js";
import { config } from "../../config/base-api-config.js";
import { createNewTokens } from "./create-new-tokens.util.js";
import { getActiveRefreshToken } from "./get-active-refresh-token.util.js";
import { BadRequestError } from "../../errors/index.js";

export async function requestTokenUsingRefreshToken(
	database: IDatabase,
	refreshToken: string,
	deviceId: string,
	userService: UserService = new UserService(database),
	organizationService: OrganizationService = new OrganizationService(database),
	authorizationsService: AuthorizationsService = new AuthorizationsService(
		database,
	),
): Promise<ITokenResponse | null> {
	const systemUserContext = getSystemUserContext();
	const activeRefreshToken = await getActiveRefreshToken(
		database,
		systemUserContext,
		refreshToken,
		deviceId,
	);

	if (!activeRefreshToken) {
		return null;
	}

	let organization: IOrganization | null = null;
	if (config.app.isMultiTenant && activeRefreshToken._orgId) {
		organization =
			await organizationService.findOne(systemUserContext, {
				filters: { _id: { eq: activeRefreshToken._orgId } },
			});
		if (!organization) {
			throw new BadRequestError("Organization not found");
		}
	}

	let userQueryOptions: IQueryOptions = {
		filters: { _id: { eq: activeRefreshToken.userId } },
	};
	if (organization) {
		userQueryOptions.filters = { ...userQueryOptions.filters, _orgId: { eq: organization._id } };
	}
	const user = await userService.findOne(systemUserContext, userQueryOptions);
	if (!user) {
		throw new BadRequestError("User not found");
	}

	const features = await authorizationsService.getUserContextFeatures(user);
	const userContext: IUserContext = {
		user,
		organization: organization ?? undefined,
		features,
	};

	return createNewTokens(userContext, activeRefreshToken);
}

import type { IUserContext } from "@loomcore/common/models";

export function isAdmin(userContext: IUserContext): boolean {
	return userContext.authorizations.some(
		(authorization) =>
			authorization.feature === "admin" ||
			authorization.feature === "system",
	);
}

import type { IUserContext } from "@loomcore/common/models";
import { isAdmin } from "./is-admin.util.js";
import { assertUserHasFeature } from "./assert-user-has-feature.util.js";

export function assertAdminOrFeature(
	userContext: IUserContext,
	features: string[],
	requireAll: boolean = false,
): void {
	if (isAdmin(userContext)) {
		return;
	}
	assertUserHasFeature(userContext, features, requireAll);
}

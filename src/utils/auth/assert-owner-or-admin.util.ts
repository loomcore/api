import type { IAuditable, IUserContext } from "@loomcore/common/models";
import { UnauthorizedError } from "../../errors/index.js";
import { isAdmin } from "./is-admin.util.js";

export function assertOwnerOrAdmin(
	userContext: IUserContext,
	entity: IAuditable,
): void {
	if (isAdmin(userContext)) {
		return;
	}
	if (userContext.user._id !== entity._createdBy) {
		throw new UnauthorizedError();
	}
}

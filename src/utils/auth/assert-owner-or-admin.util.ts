import type { IAuditable, IUserContext } from "@loomcore/common/models";
import { UnauthorizedError } from "../../errors/index.js";
import { isAdmin } from "./is-admin.util.js";
import { AppIdType } from "@loomcore/common/types";

export function assertOwnerOrAdmin(
	userContext: IUserContext,
	createdBy: AppIdType,
): void {
	if (isAdmin(userContext)) {
		return;
	}
	if (userContext.user._id !== createdBy) {
		throw new UnauthorizedError();
	}
}

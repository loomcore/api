import type { IUser, IUserContext } from "@loomcore/common/models";
import moment from "moment";
import type { IDatabase } from "../../databases/models/index.js";
import type { UpdateResult } from "../../databases/models/update-result.js";
import { UserService } from "../../services/user.service.js";

export async function changePassword(
	database: IDatabase,
	userContext: IUserContext,
	password: string,
): Promise<UpdateResult> {
	const userService = new UserService(database);
	const updates = {
		password: password,
		_lastPasswordChange: moment().utc().toDate(),
	};
	await userService.partialUpdateById(
		userContext,
		userContext.user._id,
		updates as Partial<IUser>,
	);

	return {
		success: true,
		count: 1,
	};
}

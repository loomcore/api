import type { AppIdType } from "@loomcore/common/types";
import { getSystemUserContext, type IUser } from "@loomcore/common/models";
import moment from "moment";
import type { IDatabase } from "../../databases/models/index.js";
import { UserService } from "../../services/user.service.js";

export async function updateLastLoggedIn(
	database: IDatabase,
	userId: AppIdType,
	userService: UserService = new UserService(database),
): Promise<void> {
	try {
		const updates: Partial<IUser> = {
			_lastLoggedIn: moment().utc().toDate(),
		};
		await userService.update(
			getSystemUserContext(),
			{ filters: { _id: { eq: userId } } },
			updates,
		);
	} catch (error) {
		console.error(`Error updating lastLoggedIn: ${error}`);
	}
}

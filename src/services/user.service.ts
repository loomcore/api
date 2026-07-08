import {
	type IUser,
	type IUserContext,
	UserSpec,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import type { IDatabase } from "../databases/models/index.js";
import { ServerError } from "../errors/index.js";
import { passwordUtils } from "../utils/password.utils.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";

export class UserService extends MultiTenantApiService<IUser> {
	constructor(database: IDatabase) {
		super(database, "users", "user", UserSpec);
	}

	// Don't full update a User. You can create, partial update, or delete a user.
	override async fullUpdateById(
		_userContext: IUserContext,
		_id: AppIdType,
		_entity: IUser,
	): Promise<IUser> {
		throw new ServerError("User full update is not allowed.");
	}

	override async preProcessEntity(
		userContext: IUserContext,
		entity: Partial<IUser>,
		isCreate: boolean,
		_allowId: boolean = false,
	): Promise<Partial<IUser>> {
		// First, let the base class do its preparation
		const preparedEntity = await super.preProcessEntity(
			userContext,
			entity,
			isCreate,
		);

		if (preparedEntity.email) {
			preparedEntity.email = preparedEntity.email.toLowerCase();
		}

		if (preparedEntity.password) {
			preparedEntity.password = await passwordUtils.hashPassword(
				preparedEntity.password,
			);
		}

		return preparedEntity;
	}
}

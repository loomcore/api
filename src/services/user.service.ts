import {
	type IModelSpec,
	type IPagedResult,
	type IQueryOptions,
	type IUser,
	type IUserContext,
	UserSpec,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import type { IDatabase } from "../databases/models/index.js";
import {
	BadRequestError,
	ServerError,
	UnauthorizedError,
} from "../errors/index.js";
import { passwordUtils } from "../utils/password.utils.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";

export class UserService extends MultiTenantApiService<IUser> {
	constructor(database: IDatabase, modelSpec: IModelSpec = UserSpec) {
		super(database, "users", "user", modelSpec);
	}

	private isAdmin(userContext: IUserContext): boolean {
		return userContext.authorizations.some(
			(authorization) =>
				authorization.feature === "admin" ||
				authorization.feature === "system",
		);
	}

	private assertAdmin(userContext: IUserContext): void {
		if (!this.isAdmin(userContext)) {
			throw new UnauthorizedError();
		}
	}

	private assertSelfOrAdmin(
		userContext: IUserContext,
		id: AppIdType,
	): void {
		if (this.isAdmin(userContext)) {
			return;
		}
		if (userContext.user._id !== id) {
			throw new UnauthorizedError();
		}
	}

	override async getById(
		userContext: IUserContext,
		id: AppIdType,
	): Promise<IUser> {
		this.assertSelfOrAdmin(userContext, id);
		return super.getById(userContext, id);
	}

	override async get(
		userContext: IUserContext,
		queryOptions?: IQueryOptions,
	): Promise<IPagedResult<IUser>> {
		this.assertAdmin(userContext);
		return super.get(userContext, queryOptions);
	}

	override async getAll(userContext: IUserContext): Promise<IUser[]> {
		this.assertAdmin(userContext);
		return super.getAll(userContext);
	}

	override async getCount(userContext: IUserContext): Promise<number> {
		this.assertAdmin(userContext);
		return super.getCount(userContext);
	}

	// Don't full update a User. You can create, partial update, or delete a user.
	override async fullUpdateById(
		_userContext: IUserContext,
		_id: AppIdType,
		_entity: IUser,
	): Promise<IUser> {
		throw new ServerError("User full update is not allowed.");
	}

	override async update(
		userContext: IUserContext,
		queryObject: IQueryOptions,
		entity: Partial<IUser>,
	): Promise<IUser[]> {
		this.assertAdmin(userContext);
		this.assertPasswordUpdateAllowed(userContext, null, entity, false);
		return super.update(userContext, queryObject, entity);
	}

	override async batchUpdate(
		userContext: IUserContext,
		entities: Partial<IUser>[],
	): Promise<IUser[]> {
		this.assertAdmin(userContext);
		for (const entity of entities) {
			this.assertPasswordUpdateAllowed(userContext, null, entity, false);
		}
		return super.batchUpdate(userContext, entities);
	}

	override async partialUpdateById(
		userContext: IUserContext,
		id: AppIdType,
		entity: Partial<IUser>,
		allowPasswordUpdate: boolean = false,
	): Promise<IUser> {
		this.assertSelfOrAdmin(userContext, id);
		this.assertPasswordUpdateAllowed(
			userContext,
			id,
			entity,
			allowPasswordUpdate,
		);
		return super.partialUpdateById(userContext, id, entity);
	}

	private assertPasswordUpdateAllowed(
		userContext: IUserContext,
		id: AppIdType | null,
		entity: Partial<IUser>,
		allowPasswordUpdate: boolean,
	): void {
		if (!("password" in entity)) {
			return;
		}

		if (!entity.password) {
			throw new BadRequestError("Password cannot be empty.");
		}

		if (!allowPasswordUpdate) {
			throw new ServerError(
				"Use auth change password endpoint to update password.",
			);
		}

		if (userContext.user._id !== id) {
			throw new ServerError("You can only update your own password.");
		}
	}

	override async preProcessEntity(
		userContext: IUserContext,
		entity: Partial<IUser>,
		isCreate: boolean,
		allowId: boolean = false,
	): Promise<Partial<IUser>> {
		// First, let the base class do its preparation
		const preparedEntity = await super.preProcessEntity(
			userContext,
			entity,
			isCreate,
			allowId,
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

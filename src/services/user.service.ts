import { Value } from '@sinclair/typebox/value';
import { IUser, IUserContext, UserSpec, PublicUserSchema, IPagedResult, IQueryOptions, IUserContextAuthorization } from '@loomcore/common/models';
import type { AppId } from '@loomcore/common/types';
import { MultiTenantApiService } from './index.js';
import { IdNotFoundError, ServerError } from '../errors/index.js';
import { IDatabase } from '../databases/models/index.js';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';

export class UserService extends MultiTenantApiService<IUser> {
	constructor(database: IDatabase) {
		super(database, 'users', 'user', UserSpec);
	}

	// Can't full update a User. You can create, partial update, or explicitly change the password.
	override async fullUpdateById(userContext: IUserContext, id: AppId, entity: IUser): Promise<IUser> {
		throw new ServerError('Cannot full update a user. Either use PATCH or /auth/change-password to update password.');
	}

	override async preProcessEntity(userContext: IUserContext, entity: Partial<IUser>, isCreate: boolean, allowId: boolean = false): Promise<Partial<IUser>> {
		// First, let the base class do its preparation
		const preparedEntity = await super.preProcessEntity(userContext, entity, isCreate);

		if (preparedEntity.email) {
			preparedEntity.email = preparedEntity.email.toLowerCase();
		}

		// Only clean the User object during updates, not during creation. If we want to actually update the password, we need to use 
		//  a specific, explicit endpoint - /auth/change-password
		if (!isCreate) {
			// Use TypeBox's Value.Clean with PublicUserSchema to remove properties such as the password field.
			// This will remove any properties not in the PublicUserSchema, including password
			return Value.Clean(PublicUserSchema, preparedEntity) as Partial<IUser>;
		}

		return preparedEntity;
	}
}

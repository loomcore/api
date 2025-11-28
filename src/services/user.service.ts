import {Value} from '@sinclair/typebox/value';
import {IUser, IUserContext, UserSpec, PublicUserSchema} from '@loomcore/common/models';
import {MultiTenantApiService} from '../services/index.js';
import {ServerError} from '../errors/index.js';
import { IDatabase } from '../databases/models/index.js';

export class UserService extends MultiTenantApiService<IUser> {
  constructor(database: IDatabase) {
    super(database, 'users', 'user', UserSpec);
  }

	// Can't full update a User. You can create, partial update, or explicitly change the password.
	override async fullUpdateById(userContext: IUserContext, id: string, entity: IUser): Promise<IUser> {
		throw new ServerError('Cannot full update a user. Either use PATCH or /auth/change-password to update password.');
	}

	override async preprocessEntity(userContext: IUserContext, entity: Partial<IUser>, isCreate: boolean, allowId: boolean = false): Promise<Partial<IUser>> {
		// First, let the base class do its preparation
		const preparedEntity = await super.preprocessEntity(userContext, entity, isCreate);
		
		if (preparedEntity.email) {
			preparedEntity.email = preparedEntity.email.toLowerCase();
		}
		
		// Only clean the User object during updates, not during creation. If we want to actually update the password, we need to use 
		//  a specific, explicit endpoint - /auth/change-password
		if (!isCreate) {
			// Use TypeBox's Value.Clean with PublicUserSchema to remove the password field.
			// This will remove any properties not in the PublicUserSchema, including password
			return Value.Clean(PublicUserSchema, preparedEntity) as Partial<IUser>;
		}
		
		return preparedEntity;
	}
}


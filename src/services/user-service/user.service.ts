import { Value } from '@sinclair/typebox/value';
import { IUser, IUserContext, UserSpec, PublicUserSchema, IPagedResult, IQueryOptions } from '@loomcore/common/models';
import { MultiTenantApiService } from '../index.js';
import { IdNotFoundError, ServerError } from '../../errors/index.js';
import { IDatabase } from '../../databases/models/index.js';
import { PostgresDatabase } from '../../databases/postgres/postgres.database.js';

export class UserService extends MultiTenantApiService<IUser> {
	constructor(database: IDatabase) {
		super(database, 'users', 'user', UserSpec);
	}

	// Can't full update a User. You can create, partial update, or explicitly change the password.
	override async fullUpdateById(userContext: IUserContext, id: string, entity: IUser): Promise<IUser> {
		throw new ServerError('Cannot full update a user. Either use PATCH or /auth/change-password to update password.');
	}

	override async getById(userContext: IUserContext, id: string): Promise<IUser> {
		const { operations, queryObject } = this.prepareQuery(userContext, {}, []);
		const user = await this.database.getById<IUser>(operations, queryObject, id, this.pluralResourceName);
		if (!user) {
			throw new IdNotFoundError();
		}
		const usersWithAuth = await this.addAuthorizationsToUsers(userContext, [user]);
		return usersWithAuth[0];
	}

	override async get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<IUser>> {
		const { operations, queryObject } = this.prepareQuery(userContext, queryOptions, []);
		const pagedResult = await this.database.get<IUser>(operations, queryObject, this.modelSpec, this.pluralResourceName);
		const transformedEntities = await this.addAuthorizationsToUsers(userContext, pagedResult.entities || []);
		return {
			...pagedResult,
			entities: transformedEntities
		};
	}

	override async getAll(userContext: IUserContext): Promise<IUser[]> {
		const { operations } = this.prepareQuery(userContext, {}, []);
		const users = await this.database.getAll<IUser>(operations, this.pluralResourceName);
		return this.addAuthorizationsToUsers(userContext, users);
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

	/**
	 * Adds authorizations to users by fetching them from the database.
	 * This method is reusable across getById, get, and getAll.
	 */
	private async addAuthorizationsToUsers(userContext: IUserContext, users: IUser[]): Promise<IUser[]> {
		if (users.length === 0) {
			return users;
		}

		// Only fetch authorizations if using PostgresDatabase
		if (!(this.database instanceof PostgresDatabase)) {
			return users.map(user => this.postprocessEntity(userContext, user));
		}

		const userIds = users.map(user => user._id);
		const orgId = userContext._orgId;
		const authorizationsMap = await (this.database as PostgresDatabase).getUserAuthorizations(userIds, orgId);

		// Add authorizations to each user and postprocess
		return users.map(user => {
			const authorizations = authorizationsMap.get(user._id) || [];
			const userWithAuth = {
				...user,
				authorizations
			};
			return this.postprocessEntity(userContext, userWithAuth);
		});
	}
}


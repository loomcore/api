import {
  type IModelSpec,
  type IQueryOptions,
  type IUser,
  type IUserContext,
  UserSpec,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { IDatabase } from '../databases/models/index.js';
import { BadRequestError, ServerError } from '../errors/index.js';
import { passwordUtils } from '../utils/password.utils.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import moment from 'moment';

export class UserService extends MultiTenantApiService<IUser> {
  constructor(database: IDatabase, modelSpec: IModelSpec = UserSpec) {
    super(database, 'users', 'user', modelSpec);
  }

  // Don't full update a User. You can create, partial update, or delete a user.
  override async fullUpdateById(_userContext: IUserContext, _id: AppIdType, _entity: IUser): Promise<IUser> {
    throw new ServerError('User full update is not allowed.');
  }

  override async update(userContext: IUserContext, queryObject: IQueryOptions, entity: Partial<IUser>): Promise<IUser[]> {
    this.assertPasswordNotPresent(entity);
    return super.update(userContext, queryObject, entity);
  }

  override async batchUpdate(userContext: IUserContext, entities: Partial<IUser>[]): Promise<IUser[]> {
    for (const entity of entities) {
      this.assertPasswordNotPresent(entity);
    }
    return super.batchUpdate(userContext, entities);
  }

  override async partialUpdateById(userContext: IUserContext, id: AppIdType, entity: Partial<IUser>): Promise<IUser> {
    this.assertPasswordNotPresent(entity);
    return super.partialUpdateById(userContext, id, entity);
  }

  // Only this method can change a password.
  async changePassword(userContext: IUserContext, id: AppIdType, password: string) {
    if (!password) {
      throw new BadRequestError('Password cannot be empty.');
    }
    const updates = {
      password: password,
    };
    return super.partialUpdateById(userContext, id, updates);
  }

  override async preProcessEntity(
    userContext: IUserContext,
    entity: Partial<IUser>,
    isCreate: boolean,
    allowId: boolean = false,
  ): Promise<Partial<IUser>> {
    // First, let the base class do its preparation
    const preparedEntity = await super.preProcessEntity(userContext, entity, isCreate, allowId);

    if (preparedEntity.email) {
      preparedEntity.email = preparedEntity.email.toLowerCase();
    }

    if (preparedEntity.password) {
      preparedEntity.password = await passwordUtils.hashPassword(preparedEntity.password);
      if (!isCreate) {
        // Do this here 'cause the system property _lastPasswordChange may get stripped in super.preProcessEntity in the logged-in change password flow.
        preparedEntity._lastPasswordChange = moment().utc().toDate();
      }
    }

    return preparedEntity;
  }

  private assertPasswordNotPresent(entity: Partial<IUser>) {
    if ('password' in entity) {
      throw new BadRequestError('Cannot update user with password present on the entity.');
    }
  }
}

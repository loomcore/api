import {
  type IModelSpec,
  type IQueryOptions,
  type IUser,
  UserSpec,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { IDatabase } from '../databases/models/index.js';
import { BadRequestError, ServerError } from '../errors/index.js';
import { passwordUtils } from '../utils/password.utils.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import type { IRequestContext } from './request-context.interface.js';
import moment from 'moment';

export class UserService extends GenericApiService<IUser> {
  constructor(database: IDatabase, modelSpec: IModelSpec = UserSpec) {
    super(database, 'user', 'users', modelSpec);
  }

  // Don't full update a User. You can create, partial update, or delete a user.
  override async fullUpdateById(_context: IRequestContext, _id: AppIdType, _entity: IUser): Promise<IUser> {
    throw new ServerError('User full update is not allowed.');
  }

  override async update(context: IRequestContext, queryObject: IQueryOptions, entity: Partial<IUser>): Promise<IUser[]> {
    this.assertPasswordNotPresent(entity);
    return super.update(context, queryObject, entity);
  }

  override async batchUpdate(context: IRequestContext, entities: Partial<IUser>[]): Promise<IUser[]> {
    for (const entity of entities) {
      this.assertPasswordNotPresent(entity);
    }
    return super.batchUpdate(context, entities);
  }

  override async partialUpdateById(context: IRequestContext, id: AppIdType, entity: Partial<IUser>): Promise<IUser> {
    this.assertPasswordNotPresent(entity);
    return super.partialUpdateById(context, id, entity);
  }

  // Only this method can change a password.
  async changePassword(context: IRequestContext, id: AppIdType, password: string) {
    if (!password) {
      throw new BadRequestError('Password cannot be empty.');
    }
    const updates = {
      password: password,
    };
    return super.partialUpdateById(context, id, updates);
  }

  override async prepareEntityForWrite(
    _context: IRequestContext,
    _spec: import('@loomcore/common/models').IModelSpec,
    entity: Partial<IUser>,
    isCreate: boolean,
  ): Promise<Partial<IUser>> {
    if (entity.email) {
      entity.email = entity.email.toLowerCase();
    }

    if (entity.password) {
      entity.password = await passwordUtils.hashPassword(entity.password);
      if (!isCreate) {
        // Do this here 'cause the system property _lastPasswordChange may get stripped in applySystemWriteRules in the logged-in change password flow.
        entity._lastPasswordChange = moment().utc().toDate();
      }
    }

    return entity;
  }

  private assertPasswordNotPresent(entity: Partial<IUser>) {
    if ('password' in entity) {
      throw new BadRequestError('Cannot update user with password present on the entity.');
    }
  }
}

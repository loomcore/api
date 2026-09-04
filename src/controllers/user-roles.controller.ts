import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { type IUserRole, UserRoleModelSpec } from '@loomcore/common/models';
import { Authorize } from '../decorators/authorize.decorator.js';
import { UserRoleService } from '../services/user-role.service.js';
import { ApiController } from './api.controller.js';

@Authorize('admin')
export class UserRolesController extends ApiController<IUserRole> {
  constructor(app: Application, database: IDatabase) {
    const userRoleService = new UserRoleService(database);
    super(
      'user-roles',
      app,
      userRoleService,
      'user-role',
      UserRoleModelSpec,
    );
  }
}

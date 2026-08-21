import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { type IUserRole, UserRoleModelSpec } from '@loomcore/common/models';
import { UserRolesService } from '../services/user-roles.service.js';
import { ApiController } from './api.controller.js';

export class UserRolesController extends ApiController<IUserRole> {
  constructor(app: Application, database: IDatabase) {
    const userRoleService = new UserRolesService(database);
    super(
      'user-roles',
      app,
      userRoleService,
      'user-role',
      UserRoleModelSpec,
    );
  }
}

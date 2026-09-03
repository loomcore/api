import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { type IRole, RoleModelSpec } from '@loomcore/common/models';
import { RoleService } from '../services/role.service.js';
import { ApiController } from './api.controller.js';

export class RolesController extends ApiController<IRole> {
  constructor(app: Application, database: IDatabase) {
    const roleService = new RoleService(database);
    super(
      'roles',
      app,
      roleService,
      'role',
      RoleModelSpec,
    );
  }
}

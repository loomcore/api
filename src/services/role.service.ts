import { IRole, IUserContext, RoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';

export class RoleService extends MultiTenantApiService<IRole> {
  constructor(database: IDatabase) {
    super(database, 'roles', 'role', RoleModelSpec);
  }
}

import { IUserContext, IUserRole, UserRoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';

export class UserRoleService extends MultiTenantApiService<IUserRole> {
  constructor(database: IDatabase) {
    super(database, 'userRoles', 'userRole', UserRoleModelSpec);
  }
}

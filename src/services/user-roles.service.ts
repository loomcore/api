import { IUserContext, IUserRole, UserRoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import { assertUserHasFeature } from '../utils/index.js';


export class UserRolesService extends MultiTenantApiService<IUserRole> {
  constructor(database: IDatabase) {
    super(database, 'userRoles', 'userRole', UserRoleModelSpec);
  }

  override async preProcessEntity(userContext: IUserContext, entity: Partial<IUserRole>, isCreate: boolean, allowId: boolean = true): Promise<Partial<IUserRole>> {
    assertUserHasFeature(userContext, ['admin', 'system', 'user-roles']);
    return super.preProcessEntity(userContext, entity, isCreate, allowId);
  }
}

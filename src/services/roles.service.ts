import { IRole, IUserContext, RoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import { assertUserHasFeature } from '../utils/index.js';


export class RolesService extends MultiTenantApiService<IRole> {
  constructor(database: IDatabase) {
    super(database, 'roles', 'role', RoleModelSpec);
  }

  override async preProcessEntity(userContext: IUserContext, entity: Partial<IRole>, isCreate: boolean, allowId: boolean = true): Promise<Partial<IRole>> {
    assertUserHasFeature(userContext, ['admin', 'system', 'roles']);
    return super.preProcessEntity(userContext, entity, isCreate, allowId);
  }
}

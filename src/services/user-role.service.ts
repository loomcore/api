import { IUserRole, UserRoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';

export class UserRoleService extends GenericApiService<IUserRole> {
  constructor(database: IDatabase) {
    super(database, 'userRole', 'userRoles', UserRoleModelSpec);
  }
}

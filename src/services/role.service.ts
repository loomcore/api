import { IRole, RoleModelSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';

export class RoleService extends GenericApiService<IRole> {
  constructor(database: IDatabase) {
    super(database, 'role', 'roles', RoleModelSpec);
  }
}

import { FeatureModelSpec, IFeature, IUserContext } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';


export class FeatureService extends MultiTenantApiService<IFeature> {
  constructor(database: IDatabase) {
    super(database, 'features', 'feature', FeatureModelSpec);
  }
}

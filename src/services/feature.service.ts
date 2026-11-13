import { FeatureModelSpec, IFeature } from '@loomcore/common/models';
import { IDatabase } from '../databases/index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';

export class FeatureService extends GenericApiService<IFeature> {
  constructor(database: IDatabase) {
    super(database, 'feature', 'features', FeatureModelSpec);
  }
}

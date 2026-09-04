import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { FeatureModelSpec, type IFeature } from '@loomcore/common/models';
import { Authorize } from '../decorators/authorize.decorator.js';
import { FeatureService } from '../services/feature.service.js';
import { ApiController } from './api.controller.js';

@Authorize('admin')
export class FeaturesController extends ApiController<IFeature> {
  constructor(app: Application, database: IDatabase) {
    const featureService = new FeatureService(database);
    super(
      'features',
      app,
      featureService,
      'feature',
      FeatureModelSpec,
    );
  }
}

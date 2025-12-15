import { IFeature } from "../models/feature.model.js";

import { FeatureModelSpec } from "../models/feature.model.js";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";

export class FeaturesController extends ApiController<IFeature, IFeature> {
    constructor(app: Application, database: IDatabase) {
        const featureService = new MultiTenantApiService<IFeature, IFeature>(database, 'features', 'feature', FeatureModelSpec);
        super('features', app, featureService, 'feature', FeatureModelSpec, FeatureModelSpec);
    }
}
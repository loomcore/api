import { IFeature } from "../models/feature.model.js";

import { FeatureModelSpec } from "../models/feature.model.js";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { GenericApiService } from "../services/generic-api-service/generic-api.service.js";

export class FeaturesController extends ApiController<IFeature> {
    constructor(app: Application, database: IDatabase) {
        const featureService = new GenericApiService<IFeature>(database, 'features', 'feature', FeatureModelSpec);
        super('features', app, featureService, 'feature', FeatureModelSpec, FeatureModelSpec);
    }
}
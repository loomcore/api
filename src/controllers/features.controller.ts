import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { adminWrites } from "../middleware/index.js";
import { type IFeature, FeatureModelSpec } from "../models/feature.model.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";
import { ApiController } from "./api.controller.js";

export class FeaturesController extends ApiController<IFeature> {
	constructor(app: Application, database: IDatabase) {
		const featureService = new MultiTenantApiService<IFeature>(
			database,
			"features",
			"feature",
			FeatureModelSpec,
		);
		super(
			"features",
			app,
			featureService,
			adminWrites,
			"feature",
			FeatureModelSpec,
			FeatureModelSpec,
		);
	}
}

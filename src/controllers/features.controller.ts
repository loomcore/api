import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { FeatureModelSpec, type IFeature } from "@loomcore/common/models";
import { FeaturesService } from "../services/features.service.js";
import { ApiController } from "./api.controller.js";

export class FeaturesController extends ApiController<IFeature> {
	constructor(app: Application, database: IDatabase) {
		const featureService = new FeaturesService(database);
		super(
			"features",
			app,
			featureService,
			"feature",
			FeatureModelSpec,
		);
	}
}

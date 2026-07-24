import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { adminWrites } from "../middleware/index.js";
import {
	AuthorizationModelSpec,
	type IAuthorization,
} from "../models/authorization.model.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";
import { ApiController } from "./api.controller.js";

export class AuthorizationsController extends ApiController<IAuthorization> {
	constructor(app: Application, database: IDatabase) {
		const authorizationService = new MultiTenantApiService<IAuthorization>(
			database,
			"authorizations",
			"authorization",
			AuthorizationModelSpec,
		);
		super(
			"authorizations",
			app,
			authorizationService,
			adminWrites,
			"authorization",
			AuthorizationModelSpec,
		);
	}
}

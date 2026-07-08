import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { IRole, RoleModelSpec } from "../models/role.model.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";
import { ApiController } from "./api.controller.js";

export class RolesController extends ApiController<IRole> {
	constructor(app: Application, database: IDatabase) {
		const roleService = new MultiTenantApiService<IRole>(
			database,
			"roles",
			"role",
			RoleModelSpec,
		);
		super("roles", app, roleService, "role", RoleModelSpec, RoleModelSpec);
	}
}

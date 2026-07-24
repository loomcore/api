import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { adminWrites } from "../middleware/index.js";
import {
	type IUserRole,
	UserRoleModelSpec,
} from "../models/user-role.model.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";
import { ApiController } from "./api.controller.js";

export class UserRolesController extends ApiController<IUserRole> {
	constructor(app: Application, database: IDatabase) {
		const userRoleService = new MultiTenantApiService<IUserRole>(
			database,
			"user_roles",
			"user_role",
			UserRoleModelSpec,
		);
		super(
			"user-roles",
			app,
			userRoleService,
			adminWrites,
			"user-role",
			UserRoleModelSpec,
			UserRoleModelSpec,
		);
	}
}

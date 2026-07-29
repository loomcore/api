import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { type IRole, RoleModelSpec } from "@loomcore/common/models";
import { RolesService } from "../services/roles.service.js";
import { ApiController } from "./api.controller.js";

export class RolesController extends ApiController<IRole> {
	constructor(app: Application, database: IDatabase) {
		const roleService = new RolesService(database);
		super(
			"roles",
			app,
			roleService,
			"role",
			RoleModelSpec,
		);
	}
}

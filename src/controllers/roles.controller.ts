import { IDatabase } from "../databases/models/index.js";
import { IRole, RoleModelSpec } from "../models/role.model.js";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";

export class RolesController extends ApiController<IRole, IRole> {
    constructor(app: Application, database: IDatabase) {
        const roleService = new MultiTenantApiService<IRole, IRole>(database, 'roles', 'role', RoleModelSpec);
        super('roles', app, roleService, 'role', RoleModelSpec, RoleModelSpec);
    }
}
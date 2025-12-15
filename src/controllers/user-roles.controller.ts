import { ApiController } from "./api.controller.js";
import { IDatabase } from "../databases/models/index.js";
import { Application } from "express";
import { IUserRole, UserRoleModelSpec } from "../models/user-role.model.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";

export class UserRolesController extends ApiController<IUserRole> {
    constructor(app: Application, database: IDatabase) {
        const userRoleService = new MultiTenantApiService<IUserRole>(database, 'user_roles', 'user_role', UserRoleModelSpec);
        super('user-roles', app, userRoleService, 'user-role', UserRoleModelSpec, UserRoleModelSpec);
    }
}
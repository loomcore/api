import { IDatabase } from "../databases/models/index.js";
import { IRole, RoleModelSpec } from "../models/role.model.js";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { GenericApiService } from "../services/generic-api-service/generic-api.service.js";

export class RolesController extends ApiController<IRole> {
    constructor(app: Application, database: IDatabase) {
        const roleService = new GenericApiService<IRole>(database, 'roles', 'role', RoleModelSpec);
        super('roles', app, roleService, 'role', RoleModelSpec, RoleModelSpec);
    }
}
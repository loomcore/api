import { ApiController } from "./api.controller.js";
import { GenericApiService } from "../services/generic-api-service/generic-api.service.js";
import { IDatabase } from "../databases/models/index.js";
import { Application } from "express";
import { IUserRole, UserRoleModelSpec } from "../models/user-role.model.js";
import { IQueryOptions, IUserContext } from "@loomcore/common/models";

export class UserRolesController extends ApiController<IUserRole> {
    constructor(app: Application, database: IDatabase) {
        const userRoleService = new GenericApiService<IUserRole>(database, 'user-roles', 'user-role', UserRoleModelSpec);
        super('user-roles', app, userRoleService, 'user-role', UserRoleModelSpec, UserRoleModelSpec);
    }
}
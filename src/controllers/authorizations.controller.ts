import { IAuthorizationIn, AuthorizationModelSpec, IAuthorizationOut } from "@loomcore/common/models";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { MultiTenantApiService } from "../services/multi-tenant-api.service.js";

export class AuthorizationsController extends ApiController<IAuthorizationIn, IAuthorizationOut> {
    constructor(app: Application, database: IDatabase) {
        const authorizationService = new MultiTenantApiService<IAuthorizationIn, IAuthorizationOut>(database, 'authorizations', 'authorization', AuthorizationModelSpec);
        super('authorizations', app, authorizationService, 'authorization', AuthorizationModelSpec);
    }
}
import { IAuthorization, AuthorizationModelSpec } from "@loomcore/common/models";
import { ApiController } from "./api.controller.js";
import { Application } from "express";
import { IDatabase } from "../databases/models/index.js";
import { GenericApiService } from "../services/generic-api-service/generic-api.service.js";

export class AuthorizationsController extends ApiController<IAuthorization> {
    constructor(app: Application, database: IDatabase) {
        const authorizationService = new GenericApiService<IAuthorization>(database, 'authorizations', 'authorization', AuthorizationModelSpec);
        super('authorizations', app, authorizationService, 'authorization', AuthorizationModelSpec);
    }
}
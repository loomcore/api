import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { MultiTenantApiService } from '../services/multi-tenant-api.service.js';
import { ApiController } from './api.controller.js';
import { AuthorizationModelSpec, IAuthorization } from '@loomcore/common/models';
import { AuthorizationService } from '../services/authorization.service.js';

export class AuthorizationsController extends ApiController<IAuthorization> {
  constructor(app: Application, database: IDatabase) {
    const authorizationService = new AuthorizationService(database);
    super(
      'authorizations',
      app,
      authorizationService,
      'authorization',
      AuthorizationModelSpec,
    );
  }
}

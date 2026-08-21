import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { MultiTenantApiService } from '../services/multi-tenant-api.service.js';
import { ApiController } from './api.controller.js';
import { AuthorizationModelSpec, IAuthorization } from '@loomcore/common/models';
import { AuthorizationsService } from '../services/authorizations.service.js';

export class AuthorizationsController extends ApiController<IAuthorization> {
  constructor(app: Application, database: IDatabase) {
    const authorizationService = new AuthorizationsService(database);
    super(
      'authorizations',
      app,
      authorizationService,
      'authorization',
      AuthorizationModelSpec,
    );
  }
}

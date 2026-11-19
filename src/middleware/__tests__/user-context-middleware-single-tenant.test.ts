import { EmptyUserContext, type IUserContext } from '@loomcore/common/models';
import type { Application, NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../../config/base-api-config.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { getTestMetaOrgUserContext } from '../../__tests__/test-objects.js';
import type { IDatabase } from '../../databases/models/index.js';
import { CrossTenant } from '../../decorators/cross-tenant.decorator.js';
import { AllowAnonymous } from '../../decorators/index.js';
import { GenericApiService } from '../../services/generic-api-service/generic-api.service.js';
import type { IRequestContext } from '../../services/request-context.interface.js';
import { ApiController } from '../../controllers/api.controller.js';
import { AuthController } from '../../controllers/auth.controller.js';

@CrossTenant('single-tenant userContext probe')
class SingleTenantProbeService extends GenericApiService<TestEntity> {
  lastContext: IRequestContext | undefined;

  constructor(database: IDatabase) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
  }

  override async getAll(context: IRequestContext): Promise<TestEntity[]> {
    this.lastContext = context;
    return super.getAll(context);
  }
}

class SingleTenantProbeController extends ApiController<TestEntity> {
  readonly probeService: SingleTenantProbeService;

  constructor(app: Application, database: IDatabase) {
    const probeService = new SingleTenantProbeService(database);
    super('user-context-single', app, probeService, 'testEntity', testModelSpec);
    this.probeService = probeService;
  }

  override mapRoutes(app: Application): void {
    app.get(`/api/${this.slug}/anonymous-all`, this.authorize('getAll'), this.getAll.bind(this));
  }

  @AllowAnonymous()
  override async getAll(req: Request, res: Response, next: NextFunction) {
    return super.getAll(req, res, next);
  }
}

describe('userContext middleware single-tenant', () => {
  let testAgent: any;
  let probeController: SingleTenantProbeController;
  let originalIsMultiTenant: boolean;
  let authToken: string;

  beforeAll(async () => {
    const setup = await TestExpressApp.init(undefined, {
      setupRoutes: (app, database) => {
        probeController = new SingleTenantProbeController(app, database);
        new AuthController(app, database);
      },
    });
    originalIsMultiTenant = config.app.isMultiTenant;
    // Seed users while multi-tenant so org fixtures exist; flip after.
    await testUtils.setupTestUsers();
    testAgent = setup.agent;
    config.app.isMultiTenant = false;
  });

  afterAll(async () => {
    config.app.isMultiTenant = originalIsMultiTenant;
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    config.app.isMultiTenant = true;
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
    config.app.isMultiTenant = false;
    authToken = await testUtils.loginWithTestUser(testAgent);
    probeController.probeService.lastContext = undefined;
  });

  it('should succeed without a token and pass EmptyUserContext without an org lookup', async () => {
    // No Origin/Referer — single-tenant must not 404 for missing client domain.
    const response = await testAgent
      .get('/api/user-context-single/anonymous-all')
      .unset('Origin')
      .unset('Referer');

    expect(response.status).toBe(200);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received.user.email).toBe(EmptyUserContext.user.email);
    expect(received.features).toEqual(EmptyUserContext.features);
    expect(received.user._orgId).toBeUndefined();
    expect(received.user._id).toBeUndefined();
  });

  it('should soft-enrich with the authenticated userContext when a valid token is supplied', async () => {
    const response = await testAgent
      .get('/api/user-context-single/anonymous-all')
      .set('Authorization', authToken)
      .unset('Origin')
      .unset('Referer');

    expect(response.status).toBe(200);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received.user.email).toBe(getTestMetaOrgUserContext().user.email);
    expect(received.user._id).toBeDefined();
  });
});

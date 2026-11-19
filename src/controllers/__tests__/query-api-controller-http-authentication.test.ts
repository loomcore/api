import { EmptyUserContext, type IUserContext } from '@loomcore/common/models';
import type { Application, NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { getTestMetaOrgUserContext, TEST_META_ORG_ID } from '../../__tests__/test-objects.js';
import type { IDatabase } from '../../databases/models/index.js';
import { CrossTenant } from '../../decorators/cross-tenant.decorator.js';
import { AllowAnonymous } from '../../decorators/index.js';
import { GenericQueryService } from '../../services/generic-query-service/generic-query.service.js';
import type { IRequestContext } from '../../services/request-context.interface.js';
import { AuthController } from '../auth.controller.js';
import { QueryApiController } from '../query-api.controller.js';

@CrossTenant('HTTP auth probe — isolation not under test')
class AuthProbeQueryService extends GenericQueryService<TestEntity> {
  lastContext: IRequestContext | undefined;

  constructor(database: IDatabase) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
  }

  override async getAll(context: IRequestContext): Promise<TestEntity[]> {
    this.lastContext = context;
    return super.getAll(context);
  }

  override async getById(context: IRequestContext, id: any): Promise<TestEntity> {
    this.lastContext = context;
    return super.getById(context, id);
  }
}

class AuthProbeQueryController extends QueryApiController<TestEntity> {
  readonly probeService: AuthProbeQueryService;

  constructor(app: Application, database: IDatabase) {
    const probeService = new AuthProbeQueryService(database);
    super('auth-probe-query', app, probeService, 'testEntity', testModelSpec);
    this.probeService = probeService;
  }

  override mapRoutes(app: Application): void {
    app.get(`/api/${this.slug}/anonymous-all`, this.authorize('getAll'), this.getAll.bind(this));
    app.get(`/api/${this.slug}/public-all`, this.getAll.bind(this));
    app.get(`/api/${this.slug}/secured/:id`, this.authorize('getById'), this.getById.bind(this));
  }

  @AllowAnonymous()
  override async getAll(req: Request, res: Response, next: NextFunction) {
    return super.getAll(req, res, next);
  }
}

describe('QueryApiController HTTP authentication', () => {
  let testAgent: any;
  let probeController: AuthProbeQueryController;
  let authToken: string;
  let expiredToken: string;

  beforeAll(async () => {
    const setup = await TestExpressApp.init(undefined, {
      setupRoutes: (app, database) => {
        probeController = new AuthProbeQueryController(app, database);
        new AuthController(app, database);
      },
    });
    await testUtils.setupTestUsers();
    testAgent = setup.agent;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
    authToken = await testUtils.loginWithTestUser(testAgent);
    expiredToken = testUtils.getExpiredAuthToken();
    probeController.probeService.lastContext = undefined;
  });

  it('should succeed on an @AllowAnonymous QueryApiController method without a token and pass EmptyUserContext to the service', async () => {
    const response = await testAgent.get('/api/auth-probe-query/anonymous-all');

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(true);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received).toBeDefined();
    expect(received.user.email).toBe(EmptyUserContext.user.email);
    expect(received.features).toEqual(EmptyUserContext.features);
    expect(received.user._orgId).toBe(TEST_META_ORG_ID);
    expect(received.user._id).toBeUndefined();
  });

  it('should succeed on a QueryApiController route registered without authorize middleware without a token', async () => {
    const response = await testAgent.get('/api/auth-probe-query/public-all');

    expect(response.status).toBe(200);
    expect(response.body?.success).toBe(true);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received).toBeDefined();
    expect(received.user.email).toBe(EmptyUserContext.user.email);
    expect(received.user._orgId).toBe(TEST_META_ORG_ID);
  });

  it('should pass the authenticated userContext to the service on an @AllowAnonymous QueryApiController route when a valid token is supplied', async () => {
    const response = await testAgent
      .get('/api/auth-probe-query/anonymous-all')
      .set('Authorization', authToken);

    expect(response.status).toBe(200);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received?.user?.email).toBe(getTestMetaOrgUserContext().user.email);
    expect(received?.user?._orgId).toBe(getTestMetaOrgUserContext().user._orgId);
  });

  it('should pass the authenticated userContext to the service on a public QueryApiController route when a valid token is supplied', async () => {
    const response = await testAgent
      .get('/api/auth-probe-query/public-all')
      .set('Authorization', authToken);

    expect(response.status).toBe(200);
    const received = probeController.probeService.lastContext?.userContext as IUserContext;
    expect(received?.user?.email).toBe(getTestMetaOrgUserContext().user.email);
  });

  it('should return 401 on a secured QueryApiController route without a token', async () => {
    const response = await testAgent.get('/api/auth-probe-query/secured/507f1f77bcf86cd799439011');
    expect(response.status).toBe(401);
  });

  it('should return 401 on a secured QueryApiController route with an expired token', async () => {
    const response = await testAgent
      .get('/api/auth-probe-query/secured/507f1f77bcf86cd799439011')
      .set('Authorization', expiredToken);
    expect(response.status).toBe(401);
  });

  it('should return 401 on a secured QueryApiController route with an invalid token', async () => {
    const response = await testAgent
      .get('/api/auth-probe-query/secured/507f1f77bcf86cd799439011')
      .set('Authorization', 'Bearer not-a-valid-jwt');
    expect(response.status).toBe(401);
  });
});

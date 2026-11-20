import { EmptyUserContext, type IUserContext } from '@loomcore/common/models';
import type { Application, NextFunction, Request, Response } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getSystemContext,
  getTestMetaOrgRefererUrl,
  getTestMetaOrgUserContext,
  getTestOrgRefererUrl,
  getTestOrgUserContext,
  TEST_META_ORG_DOMAIN,
  TEST_META_ORG_ID,
  TEST_ORG_DOMAIN,
} from '../../__tests__/test-objects.js';
import { ApiController } from '../../controllers/api.controller.js';
import { AuthController } from '../../controllers/auth.controller.js';
import type { IDatabase } from '../../databases/models/index.js';
import { CrossTenant } from '../../decorators/cross-tenant.decorator.js';
import { AllowAnonymous } from '../../decorators/index.js';
import { GenericApiService } from '../../services/generic-api-service/generic-api.service.js';
import { OrganizationDomainService } from '../../services/organization-domain.service.js';
import { OrganizationService } from '../../services/organization.service.js';
import type { IRequestContext } from '../../services/request-context.interface.js';
import {
  clearActiveOrganizationDomainCache,
  getActiveOrganizationDomainCache,
} from '../ensure-user-context.js';

@CrossTenant('multi-tenant userContext probe')
class MultiTenantProbeService extends GenericApiService<TestEntity> {
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

class MultiTenantProbeController extends ApiController<TestEntity> {
  readonly probeService: MultiTenantProbeService;

  constructor(app: Application, database: IDatabase) {
    const probeService = new MultiTenantProbeService(database);
    super('user-context-multi', app, probeService, 'testEntity', testModelSpec);
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

describe('userContext middleware multi-tenant', () => {
  let testAgent: any;
  let probeController: MultiTenantProbeController;
  let database: IDatabase;
  let organizationDomainService: OrganizationDomainService;
  let authToken: string;
  let mismatchedOrgToken: string;

  beforeAll(async () => {
    const setup = await TestExpressApp.init(undefined, {
      setupRoutes: (app, database) => {
        probeController = new MultiTenantProbeController(app, database);
        new AuthController(app, database);
      },
    });
    database = setup.database;
    organizationDomainService = new OrganizationDomainService(database);
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
    mismatchedOrgToken = testUtils.getOrgAdminAuthToken();
    probeController.probeService.lastContext = undefined;
    clearActiveOrganizationDomainCache();
  });

  describe('Origin and Referer resolution', () => {
    it('should resolve the host org from the Origin header', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
      expect(received.user._id).toBeUndefined();
    });

    it('should fall back to the Referer host when Origin is absent', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .unset('Origin')
        .set('Referer', getTestMetaOrgRefererUrl());

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
    });

    it('should prefer Origin over Referer when both are present', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Referer', getTestOrgRefererUrl());

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
    });

    it('should resolve a subdomain organizationDomains entry', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_ORG_DOMAIN}`);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(String(received.user._orgId)).toBe(String(getTestOrgUserContext().user._orgId));
    });

    it('should resolve a full custom domain via organizationDomains', async () => {
      const customDomain = 'anydomain.com';
      await organizationDomainService.create(getSystemContext(), {
        _id: testUtils.getRandomId(),
        organizationId: TEST_META_ORG_ID,
        domain: customDomain,
      });
      clearActiveOrganizationDomainCache();

      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${customDomain}`);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
    });

    it('should return 404 for an unknown domain', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', 'https://unknown-host.example.com');

      expect(response.status).toBe(404);
    });

    it('should return 404 when Origin and Referer are both missing', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .unset('Origin')
        .unset('Referer');

      expect(response.status).toBe(404);
    });
  });

  describe('token enrichment', () => {
    it('should pass EmptyUserContext with host _orgId when no token is supplied', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user.email).toBe(EmptyUserContext.user.email);
      expect(received.features).toEqual(EmptyUserContext.features);
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
      expect(received.user._id).toBeUndefined();
    });

    it('should pass the authenticated userContext when the token org matches the host org', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Authorization', authToken);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user.email).toBe(getTestMetaOrgUserContext().user.email);
      expect(received.user._orgId).toBe(getTestMetaOrgUserContext().user._orgId);
      expect(received.user._id).toBeDefined();
    });

    it('should treat a mismatched-org token as EmptyUserContext with the host org on anonymous routes', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/anonymous-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Authorization', mismatchedOrgToken);

      expect(response.status).toBe(200);
      const received = probeController.probeService.lastContext?.userContext as IUserContext;
      expect(received.user._orgId).toBe(TEST_META_ORG_ID);
      expect(received.user._id).toBeUndefined();
      expect(received.user.email).toBe(EmptyUserContext.user.email);
    });

    it('should return 401 on a secured route when the token org does not match the host org', async () => {
      const response = await testAgent
        .get('/api/user-context-multi/secured/507f1f77bcf86cd799439011')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`)
        .set('Authorization', mismatchedOrgToken);

      expect(response.status).toBe(401);
    });
  });

  describe('organizationDomains cache', () => {
    let findByDomainSpy: MockInstance<OrganizationService['findByDomain']>;

    beforeEach(() => {
      findByDomainSpy = vi.spyOn(OrganizationService.prototype, 'findByDomain');
    });

    afterEach(() => {
      findByDomainSpy.mockRestore();
    });

    it('should query the DB on a cache miss and avoid a DB call on a subsequent hit', async () => {
      const first = await testAgent
        .get('/api/user-context-multi/public-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`);
      expect(first.status).toBe(200);
      expect(findByDomainSpy).toHaveBeenCalled();
      const callsAfterMiss = findByDomainSpy.mock.calls.length;

      const second = await testAgent
        .get('/api/user-context-multi/public-all')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`);
      expect(second.status).toBe(200);
      expect(findByDomainSpy.mock.calls.length).toBe(callsAfterMiss);
      expect(getActiveOrganizationDomainCache()?.has(TEST_META_ORG_DOMAIN)).toBe(true);
    });

    it('should resolve a newly registered domain on the first request after a cache miss', async () => {
      const newDomain = 'brand-new-tenant.example.com';

      const missing = await testAgent
        .get('/api/user-context-multi/public-all')
        .set('Origin', `https://${newDomain}`);
      expect(missing.status).toBe(404);

      await organizationDomainService.create(getSystemContext(), {
        _id: testUtils.getRandomId(),
        organizationId: TEST_META_ORG_ID,
        domain: newDomain,
      });

      const created = await testAgent
        .get('/api/user-context-multi/public-all')
        .set('Origin', `https://${newDomain}`);
      expect(created.status).toBe(200);
    });
  });
});

import type { Application, Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  TEST_META_ORG_DOMAIN,
  TEST_META_ORG_ID,
} from '../../__tests__/test-objects.js';
import { config } from '../../config/base-api-config.js';
import type { IDatabase } from '../../databases/models/index.js';
import { expressUtils } from '../express.utils.js';

describe('setupExpressApp utility routes', () => {
  let database: IDatabase;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
    await testUtils.setupTestUsers();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
  });

  function buildAppWithUtilityRoute(
    registerUtility: (app: Application) => void,
    registerNormal: (app: Application) => void,
  ): Application {
    return expressUtils.setupExpressApp(
      database,
      config,
      (app) => {
        registerNormal(app);
      },
      { registerUtilityRoutes: registerUtility },
    );
  }

  describe('ordering relative to userContext middleware', () => {
    it('should register utility routes before the userContext middleware', async () => {
      const order: string[] = [];
      const app = buildAppWithUtilityRoute(
        (app) => {
          app.use((req, res, next) => {
            if (req.path === '/api/utility-order') {
              order.push('utility');
            }
            next();
          });
          app.get('/api/utility-order', (_req, res) => {
            res.status(200).json({ order: [...order] });
          });
        },
        (app) => {
          app.use((req, _res, next) => {
            if (req.path === '/api/utility-order' || req.path === '/api/normal-order') {
              order.push('after-user-context-layer');
            }
            next();
          });
          app.get('/api/normal-order', (_req, res) => {
            res.status(200).json({ order: [...order] });
          });
        },
      );

      const utilityResponse = await request(app)
        .get('/api/utility-order')
        .unset('Origin')
        .unset('Referer');

      expect(utilityResponse.status).toBe(200);
      expect(utilityResponse.body.order).toEqual(['utility']);
      expect(order).toEqual(['utility']);
    });
  });

  describe('GET utility route without Origin or Referer', () => {
    it('should return 200 with no Origin or Referer in a multi-tenant app', async () => {
      const app = buildAppWithUtilityRoute(
        (app) => {
          app.get('/api/utility-health', (_req, res) => {
            res.status(200).json({ ok: true });
          });
        },
        () => {},
      );

      const response = await request(app)
        .get('/api/utility-health')
        .unset('Origin')
        .unset('Referer');

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('should leave req.userContext undefined', async () => {
      let seenUserContext: unknown = 'sentinel';
      const app = buildAppWithUtilityRoute(
        (app) => {
          app.get('/api/utility-context', (req: Request, res: Response) => {
            seenUserContext = req.userContext;
            res.status(200).json({ hasUserContext: req.userContext !== undefined });
          });
        },
        () => {},
      );

      const response = await request(app)
        .get('/api/utility-context')
        .unset('Origin')
        .unset('Referer');

      expect(response.status).toBe(200);
      expect(response.body.hasUserContext).toBe(false);
      expect(seenUserContext).toBeUndefined();
    });
  });

  describe('normal routes still require org resolution', () => {
    it('should return 404 for a normal route with no Origin or Referer', async () => {
      const app = buildAppWithUtilityRoute(
        () => {},
        (app) => {
          app.get('/api/normal', (_req, res) => {
            res.status(200).json({ ok: true });
          });
        },
      );

      const response = await request(app)
        .get('/api/normal')
        .unset('Origin')
        .unset('Referer');

      expect(response.status).toBe(404);
    });

    it('should resolve the org from Origin on a normal route', async () => {
      let resolvedOrgId: unknown;
      const app = buildAppWithUtilityRoute(
        () => {},
        (app) => {
          app.get('/api/normal-org', (req: Request, res: Response) => {
            resolvedOrgId = req.userContext?.user?._orgId;
            res.status(200).json({ orgId: resolvedOrgId });
          });
        },
      );

      const response = await request(app)
        .get('/api/normal-org')
        .set('Origin', `https://${TEST_META_ORG_DOMAIN}`);

      expect(response.status).toBe(200);
      expect(String(response.body.orgId)).toBe(String(TEST_META_ORG_ID));
      expect(String(resolvedOrgId)).toBe(String(TEST_META_ORG_ID));
    });
  });
});

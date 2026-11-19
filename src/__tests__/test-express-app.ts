import { initializeTypeBox } from '@loomcore/common/validation';
import type { Application } from 'express';
import supertest from 'supertest';

import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/database.interface.js';
import { clearActiveOrganizationDomainCache } from '../middleware/ensure-user-context.js';
import {
  expressUtils,
  type RouteSetupFunction,
  type SetupExpressAppOptions,
} from '../utils/express.utils.js';
import { setupTestConfig } from './common-test.utils.js';
import { TestMongoDatabase } from './mongo-db.test-database.js';
import { TestPostgresDatabase } from './postgres.test-database.js';
import type { ITestDatabase } from './test-database.interface.js';
import { TEST_META_ORG_DOMAIN } from './test-objects.js';

/**
 * Options for `TestExpressApp.init`.
 * `setupRoutes` is passed through to production `expressUtils.setupExpressApp` as its
 * `setupRoutes` argument (controller registration). `registerUtilityRoutes` matches production.
 */
export type TestExpressAppInitOptions = SetupExpressAppOptions & {
  setupRoutes?: RouteSetupFunction;
};

type TestExpressAppInitResult = {
  app: Application;
  database: IDatabase;
  testDatabase: ITestDatabase;
  agent: any;
};

let app: Application;
let database: IDatabase;
let testDatabase: ITestDatabase;
let initPromise: Promise<TestExpressAppInitResult> | null = null;

/**
 * Initialize the Express application with a test database.
 * Uses the same `expressUtils.setupExpressApp` path as production: pass controller
 * registration via `options.setupRoutes` (and optional `registerUtilityRoutes`) so
 * route order matches production (utility → userContext → routes → not-found → errorHandler).
 * @param useMongoDb - If not provided, will check TEST_DATABASE env var ('mongodb' or 'postgres')
 * @param options - `setupRoutes` / `registerUtilityRoutes` forwarded to `setupExpressApp`
 * @returns Promise resolving to an object with the app, database, and supertest agent
 */
async function init(
  useMongoDb?: boolean,
  options?: TestExpressAppInitOptions,
): Promise<TestExpressAppInitResult> {
  // If useMongoDb is not explicitly provided, check environment variable
  if (useMongoDb === undefined) {
    const testDb = process.env.TEST_DATABASE;
    useMongoDb = testDb === 'mongodb';
  }

  // Return existing promise if initialization is already in progress
  if (initPromise) {
    return initPromise;
  }

  // Create and cache the initialization promise
  initPromise = performInit(useMongoDb, options);
  return initPromise;
}

async function performInit(
  useMongoDb: boolean,
  options?: TestExpressAppInitOptions,
): Promise<TestExpressAppInitResult> {
  // Set up a fake clientSecret for authentication
  setupTestConfig(true, useMongoDb ? 'mongodb' : 'postgres');

  // Initialize TypeBox format validators
  initializeTypeBox();

  if (!database) {
    if (useMongoDb) {
      const testMongoDb = new TestMongoDatabase();
      testDatabase = testMongoDb;
      database = await testMongoDb.init();
    } else {
      const testPostgresDb = new TestPostgresDatabase();
      testDatabase = testPostgresDb;
      database = await testPostgresDb.init();
    }
  }

  // Same production setupExpressApp path (no nested sub-app)
  if (!app) {
    const { setupRoutes, registerUtilityRoutes } = options ?? {};
    app = expressUtils.setupExpressApp(
      database,
      config,
      setupRoutes ?? ((_app, _database, _config) => {}),
      registerUtilityRoutes ? { registerUtilityRoutes } : undefined,
    );
  }

  // Create a supertest agent for making test requests.
  // Default Origin simulates a browser hitting the meta-org client app (required in multi-tenant mode).
  const agent = supertest.agent(app);
  agent.set('Origin', `https://${TEST_META_ORG_DOMAIN}`);

  return {
    app,
    database,
    testDatabase,
    agent,
  };
}

/**
 * Clear all collections in the database
 */
async function clearCollections(): Promise<void> {
  if (testDatabase) {
    await testDatabase.clearCollections();
  }
  // Domains were wiped with collections; drop stale domain→orgId mappings.
  clearActiveOrganizationDomainCache();
}

/**
 * Clean up resources
 */
async function cleanup(): Promise<void> {
  try {
    if (testDatabase) {
      await testDatabase.cleanup();
    }
  } finally {
    // Reset initialization state even if cleanup fails (e.g. init never completed)
    initPromise = null;
    app = undefined as any;
    database = undefined as any;
    testDatabase = undefined as any;
  }
}

/**
 * Utility for setting up a minimal Express application for testing.
 * Uses the real `setupExpressApp` production path (middleware order, utility routes hook,
 * userContext, setupRoutes, not-found, errorHandler).
 */
export const TestExpressApp = {
  init,
  clearCollections,
  cleanup,
};

import { initializeTypeBox } from '@loomcore/common/validation';
import express, { type Application } from 'express';
import supertest from 'supertest';

import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/database.interface.js';
import { clearActiveOrganizationDomainCache } from '../middleware/ensure-user-context.js';
import {
  expressUtils,
  type SetupExpressAppOptions,
} from '../utils/express.utils.js';
import { setupTestConfig } from './common-test.utils.js';
import { TestMongoDatabase } from './mongo-db.test-database.js';
import { TestPostgresDatabase } from './postgres.test-database.js';
import type { ITestDatabase } from './test-database.interface.js';
import { TEST_META_ORG_DOMAIN } from './test-objects.js';

export type TestExpressAppInitOptions = SetupExpressAppOptions;

type TestExpressAppInitResult = {
  app: Application;
  database: IDatabase;
  testDatabase: ITestDatabase;
  agent: any;
};

let app: Application;
let mainApp: Application;
let database: IDatabase;
let testDatabase: ITestDatabase;
let initPromise: Promise<TestExpressAppInitResult> | null = null;

/**
 * Initialize the Express application with a test database.
 * Uses the same `expressUtils.setupExpressApp` path as production (including optional
 * `registerUtilityRoutes` before userContext). Controllers register on a mounted sub-app
 * so routes can be added after init and still sit before the production not-found/error handlers.
 * @param useMongoDb - If not provided, will check TEST_DATABASE env var ('mongodb' or 'postgres')
 * @param options - Same optional hooks as production `setupExpressApp` (e.g. registerUtilityRoutes)
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

  // Set up Express app if not already done — same production setupExpressApp path
  if (!mainApp) {
    mainApp = expressUtils.setupExpressApp(
      database,
      config,
      (expressApp) => {
        // Mount a sub-app so tests can register controllers after init; the sub-app's
        // route stack is consulted at request time and sits before not-found/errorHandler.
        app = express();
        expressApp.use(app);
      },
      options,
    );
  }

  // Create a supertest agent for making test requests.
  // Default Origin simulates a browser hitting the meta-org client app (required in multi-tenant mode).
  const agent = supertest.agent(mainApp);
  agent.set('Origin', `https://${TEST_META_ORG_DOMAIN}`);

  return {
    app,
    database,
    testDatabase,
    agent,
  };
}

/**
 * No-op for callers that historically registered the error handler after controllers.
 * Terminal not-found and errorHandler are already registered by setupExpressApp.
 */
async function setupErrorHandling(): Promise<void> {
  // Production path already registered not-found + errorHandler in setupExpressApp.
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
    mainApp = undefined as any;
    database = undefined as any;
    testDatabase = undefined as any;
  }
}

/**
 * Utility for setting up a minimal Express application for testing.
 * Uses the real `setupExpressApp` production path (middleware order, utility routes hook,
 * userContext, not-found, errorHandler).
 */
export const TestExpressApp = {
  init,
  setupErrorHandling,
  clearCollections,
  cleanup,
};

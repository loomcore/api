import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { initializeTypeBox } from '@loomcore/common/validation';
import { setBaseApiConfig } from '../config/base-api-config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { ensureUserContext } from '../middleware/ensure-user-context.js';
import { TestMongoDatabase } from './mongo-db.test-database.js';
import { TestPostgresDatabase } from './postgres.test-database.js';
import { ITestDatabase } from './test-database.interface.js';
import { IDatabase } from '../databases/models/database.interface.js';
import { setupTestConfig } from './common-test.utils.js';

/**
 * Utility class for setting up a minimal Express application for testing
 * This uses the real authentication middleware, unlike our previous approach
 */
export class TestExpressApp {
  private static app: Application;
  private static database: IDatabase;
  private static testDatabase: ITestDatabase;
  private static initPromise: Promise<{ app: Application, database: IDatabase, testDatabase: ITestDatabase, agent: any }> | null = null;
  /**
   * Initialize the Express application with a test database
   * @param useMongoDb - If not provided, will check TEST_DATABASE env var ('mongodb' or 'postgres')
   * @returns Promise resolving to an object with the app, database, and supertest agent
   */
  static async init(useMongoDb?: boolean): Promise<{
    app: Application,
    database: IDatabase,
    testDatabase: ITestDatabase,
    agent: any  // Using any type for supertest agent to avoid type issues
  }> {
    // If useMongoDb is not explicitly provided, check environment variable
    if (useMongoDb === undefined) {
      const testDb = process.env.TEST_DATABASE;
      useMongoDb = testDb === 'mongodb';
    }

    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit(useMongoDb);
    return this.initPromise;
  }

  private static async _performInit(useMongoDb: boolean): Promise<{
    app: Application,
    database: IDatabase,
    testDatabase: ITestDatabase,
    agent: any
  }> {
    // Set up a fake clientSecret for authentication
    setupTestConfig(true, useMongoDb ? 'mongodb' : 'postgres');

    // Initialize TypeBox format validators
    initializeTypeBox();

    if (!this.database) {
      if (useMongoDb) {
        const testMongoDb = new TestMongoDatabase();
        this.testDatabase = testMongoDb;
        this.database = await testMongoDb.init();
      } else {
        const testPostgresDb = new TestPostgresDatabase();
        this.testDatabase = testPostgresDb;
        this.database = await testPostgresDb.init('admin', 'password');
      }
    }

    // Set up Express app if not already done
    if (!this.app) {
      this.app = express();
      this.app.use(bodyParser.json());
      this.app.use(cookieParser());  // Add cookie-parser middleware
      this.app.use(ensureUserContext);

      // Add diagnostic middleware to log all requests
      this.app.use((req, res, next) => {
        next();
      });
    }

    // Create a supertest agent for making test requests
    const agent = supertest.agent(this.app);

    return {
      app: this.app,
      database: this.database,
      testDatabase: this.testDatabase,
      agent
    };
  }

  // Use the real error handler from our application
  static async setupErrorHandling(): Promise<void> {
    // Add the same error handling middleware used in the real app
    this.app.use(errorHandler);
  }

  /**
   * Clear all collections in the database
   */
  static async clearCollections(): Promise<void> {
    if (this.testDatabase) {
      await this.testDatabase.clearCollections();
    }
  }

  /**
   * Clean up resources
   */
  static async cleanup(): Promise<void> {
    if (this.testDatabase) {
      await this.testDatabase.cleanup();
    }
    // Reset initialization state
    this.initPromise = null;
    this.app = undefined as any;
    this.database = undefined as any;
    this.testDatabase = undefined as any;
  }
} 
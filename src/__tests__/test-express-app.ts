import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { initializeTypeBox } from '@loomcore/common/validation';

import { setBaseApiConfig } from '../config/base-api-config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { ensureUserContext } from '../middleware/ensure-user-context.js';
import { TestMongoDb } from './test-mongo-db.js';
import { Database } from '../database/models/database.js';
import { MongoDBDatabase } from '../database/mongoDb/mongoDb.database.js';
import { IDatabase } from '../database/models/index.js';

/**
 * Utility class for setting up a minimal Express application for testing
 * This uses the real authentication middleware, unlike our previous approach
 */
export class TestExpressApp {
  private static app: Application;
  private static database: Database;
  private static IDatabase: IDatabase;
  private static initPromise: Promise<{ app: Application, database: Database, IDatabase: IDatabase, agent: any }> | null = null;

  /**
   * Initialize the Express application with a MongoDB memory server
   * @returns Promise resolving to an object with the app, db, and supertest agent
   */
  static async init(databaseName: string): Promise<{
    app: Application,
    database: Database,
    IDatabase: IDatabase,
    agent: any  // Using any type for supertest agent to avoid type issues
  }> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit(databaseName);
    return this.initPromise;
  }

  private static async _performInit(databaseName: string): Promise<{
    app: Application,
    database: Database,
    IDatabase: IDatabase,
    agent: any
  }> {
    // Set up a fake clientSecret for authentication
    // IMPORTANT: Must set the base API config using the proper function
    setBaseApiConfig({
      env: 'test',
      hostName: 'localhost',
      appName: 'test-app',
      clientSecret: 'test-secret',
      database: {
        name: databaseName,
      },
      externalPort: 4000,
      internalPort: 8083,
      corsAllowedOrigins: ['*'],
      saltWorkFactor: 10,
      jobTypes: '',
      deployedBranch: '',
      debug: {
        showErrors: false
      },
      app: { isMultiTenant: true },
      auth: {
        jwtExpirationInSeconds: 3600,
        refreshTokenExpirationInDays: 7,
        deviceIdCookieMaxAgeInDays: 730,
        passwordResetTokenExpirationInMinutes: 20
      },
      email: {
        // These can be empty/undefined in tests as specified by the interface
        emailApiKey: 'WeDontHaveAKeyYet',
        emailApiSecret: 'WeDontHaveASecretYet',
        fromAddress: undefined
      }
    });

    // Initialize TypeBox format validators
    initializeTypeBox();

    // Set up MongoDB memory server if not already done
    if (!this.database) {
      const db = await TestMongoDb.init();
      this.IDatabase = new MongoDBDatabase(db, databaseName);
      this.database = db;
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
      IDatabase: this.IDatabase,
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
    await TestMongoDb.clearCollections();
  }

  /**
   * Clean up resources
   */
  static async cleanup(): Promise<void> {
    await TestMongoDb.cleanup();
    // Reset initialization state
    this.initPromise = null;
    this.app = undefined as any;
    this.database = undefined as any;
  }
} 
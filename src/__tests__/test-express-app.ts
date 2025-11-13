import express, { Application } from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { initializeTypeBox } from '@loomcore/common/validation';

import testUtils from './common-test.utils.js';
import { setBaseApiConfig, initSystemUserContext } from '../config/base-api-config.js';
import { errorHandler } from '../middleware/error-handler.js';
import { ensureUserContext } from '../middleware/ensure-user-context.js';

/**
 * Utility class for setting up a minimal Express application for testing
 * This uses the real authentication middleware, unlike our previous approach
 */
export class TestExpressApp {
  private static app: Application;
  private static mongoServer: MongoMemoryServer;
  private static client: MongoClient;
  private static db: Db;
  private static initPromise: Promise<{ app: Application, db: Db, agent: any }> | null = null;

  /**
   * Initialize the Express application with a MongoDB memory server
   * @returns Promise resolving to an object with the app, db, and supertest agent
   */
  static async init(): Promise<{
    app: Application,
    db: Db,
    agent: any  // Using any type for supertest agent to avoid type issues
  }> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private static async _performInit(): Promise<{
    app: Application,
    db: Db,
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
        type: 'mongoDb',
        name: '',
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
    if (!this.db) {
      this.mongoServer = await MongoMemoryServer.create({
        instance: {
          ip: '127.0.0.1', // Use localhost to avoid permission issues
          port: 0, // Use dynamic port allocation
        },
        binary: {
          downloadDir: process.env.HOME ? `${process.env.HOME}/.cache/mongodb-binaries` : undefined,
        }
      });
      const uri = this.mongoServer.getUri();
      this.client = await MongoClient.connect(uri);
      this.db = this.client.db();
      testUtils.initialize(this.db);
      await testUtils.createIndexes(this.db);

      // Create meta org before initializing system user context
      await testUtils.createMetaOrg();
    }
    await initSystemUserContext(this.db);

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
      db: this.db,
      agent
    };
  }

  // Use the real error handler from our application
  static async setupErrorHandling(): Promise<void> {
    // Add the same error handling middleware used in the real app
    this.app.use(errorHandler);
  }

  /**
   * Clean up resources
   */
  static async cleanup(): Promise<void> {
    // Clean up test data first
    await testUtils.cleanup();

    if (this.client) {
      await this.client.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
    // Reset initialization state
    this.initPromise = null;
    this.app = undefined as any;
    this.db = undefined as any;
    this.client = undefined as any;
    this.mongoServer = undefined as any;
  }

  /**
   * Clear all collections in the database
   */
  static async clearCollections(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const collections = await this.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
} 
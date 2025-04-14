import express, { Application } from 'express';
import bodyParser from 'body-parser';
import supertest from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { CommonTestUtils } from './common-test.utils.js';
import { config as apiCommonConfig } from '../../config/index.js';
import { setApiCommonConfig } from '../../config/api-common-config.js';
import { initializeTypeBox } from '../../validation/typebox-setup.js';
import 'express-async-errors'; // This package helps Express catch async errors

/**
 * Utility class for setting up a minimal Express application for testing
 * This uses the real authentication middleware, unlike our previous approach
 */
export class TestExpressApp {
  private static app: Application;
  private static mongoServer: MongoMemoryServer;
  private static client: MongoClient;
  private static db: Db;
  
  /**
   * Initialize the Express application with a MongoDB memory server
   * @returns Promise resolving to an object with the app, db, and supertest agent
   */
  static async init(): Promise<{ 
    app: Application, 
    db: Db, 
    agent: any  // Using any type for supertest agent to avoid type issues
  }> {
    // Initialize TypeBox format validators
    initializeTypeBox();
    
    // Set up a fake clientSecret for authentication
    // IMPORTANT: Must set the API common config using the proper function
    setApiCommonConfig({
      clientSecret: 'test-secret',
      app: { multiTenant: true },
      auth: {
        jwtExpirationInSeconds: 3600,
        refreshTokenExpirationInDays: 7,
        deviceIdCookieMaxAgeInDays: 730,
        passwordResetTokenExpirationInMinutes: 20
      },
      email: {
        // These can be empty/undefined in tests as specified by the interface
        sendGridApiKey: undefined,
        fromAddress: undefined
      }
    });
    
    // Set up MongoDB memory server if not already done
    if (!this.db) {
      this.mongoServer = await MongoMemoryServer.create();
      const uri = this.mongoServer.getUri();
      this.client = await MongoClient.connect(uri);
      this.db = this.client.db();
      CommonTestUtils.initialize(this.db);
    }
    
    // Set up Express app if not already done
    if (!this.app) {
      this.app = express();
      this.app.use(bodyParser.json());
      
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

  // this isn't like what we do in the actual app. If we need it to be just like it, we'll need to pull some of that code out
  //  into a common function and use it here.
  static async setupErrorHandling(): Promise<void> {
    // Add error handling middleware
    this.app.use((err: any, req: any, res: any, next: any) => {
      res.status(err.status || 500).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    });
  }
  
  /**
   * Clean up resources
   */
  static async cleanup(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
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
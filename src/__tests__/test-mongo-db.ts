import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';

import testUtils from './common-test.utils.js';
import { initSystemUserContext } from '../config/base-api-config.js';

/**
 * Utility class for setting up a MongoDB memory server for testing
 */
export class TestMongoDb {
  private static mongoServer: MongoMemoryServer;
  private static client: MongoClient;
  private static db: Db;
  private static initPromise: Promise<Db> | null = null;

  /**
   * Initialize the MongoDB memory server and database
   * @returns Promise resolving to the database instance
   */
  static async init(): Promise<Db> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  private static async _performInit(): Promise<Db> {
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
      await this.createIndexes(this.db);

      // Create meta org before initializing system user context
      await testUtils.createMetaOrg();
    }
    await initSystemUserContext(this.db);

    return this.db;
  }

  private static async createIndexes(db: Db) {
    // create indexes - keep this in sync with the k8s/02-mongo-init-configmap.yaml that is used for actual deployment
    //  If we can figure out how to use a single file for both, that would be great.
    await db.command({
      createIndexes: "users", indexes: [ { key: { email: 1 }, name: 'email_index', unique: true, collation: { locale: 'en', strength: 1 } }]
    });
  }

  /**
   * Get the database instance (must be initialized first)
   */
  static getDb(): Db {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
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

  /**
   * Clean up MongoDB resources
   */
  static async cleanup(): Promise<void> {
    // Clean up test data first
    await testUtils.cleanup();

    if (!this.db) {
        throw new Error('Database not initialized');
    }

    const collections = await this.db.collections();
    for (const collection of collections) {
    await collection.deleteMany({});
    }

    if (this.client) {
      await this.client.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
    // Reset initialization state
    this.initPromise = null;
    this.db = undefined as any;
    this.client = undefined as any;
    this.mongoServer = undefined as any;
  }
}


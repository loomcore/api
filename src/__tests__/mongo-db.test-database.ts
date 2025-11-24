import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db, ObjectId } from 'mongodb';

import testUtils from './common-test.utils.js';
import { initSystemUserContext } from '../config/base-api-config.js';
import { ITestDatabase } from './test-database.interface.js';
import { IDatabase } from '../databases/models/index.js';
import { MongoDBDatabase } from '../databases/index.js';

/**
 * Utility class for setting up a MongoDB memory server for testing
 */
export class TestMongoDatabase implements ITestDatabase {
  private mongoServer: MongoMemoryServer | null = null;
  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private database: IDatabase | null = null;
  private initPromise: Promise<IDatabase> | null = null;

  /**
   * Initialize the MongoDB memory server and database
   * @returns Promise resolving to the database instance
   */
  async init(databaseName: string): Promise<IDatabase> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit(databaseName);
    return this.initPromise;
  }

  getRandomId(): string {
    return new ObjectId().toString();
  }

  private async _performInit(databaseName: string): Promise<IDatabase> {
    // Set up MongoDB memory server if not already done
    if (!this.database) {
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
      this.mongoClient = await MongoClient.connect(uri);
      this.mongoDb = this.mongoClient.db();
      const testDatabase = new MongoDBDatabase(this.mongoDb);
      this.database = testDatabase;
      testUtils.initialize(testDatabase);
      await this.createIndexes(this.mongoDb);

      // Create meta org before initializing system user context
      await testUtils.createMetaOrg();
    }

    await initSystemUserContext(this.database);

    return this.database;
  }

  private async createIndexes(db: Db) {
    // create indexes - keep this in sync with the k8s/02-mongo-init-configmap.yaml that is used for actual deployment
    //  If we can figure out how to use a single file for both, that would be great.
    await db.command({
      createIndexes: "users", indexes: [ { key: { email: 1 }, name: 'email_index', unique: true, collation: { locale: 'en', strength: 1 } }]
    });
  }

  /**
   * Clear all collections in the database
   */
  async clearCollections(): Promise<void> {
    if (!this.mongoDb) {
      throw new Error('Database not initialized');
    }

    const collections = await this.mongoDb.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }

  /**
   * Clean up MongoDB resources
   */
  async cleanup(): Promise<void> {
    // Clean up test data first
    await testUtils.cleanup();

    await this.clearCollections();

    if (this.mongoClient) {
      await this.mongoClient.close();
    }
    if (this.mongoServer) {
      await this.mongoServer.stop();
    }
    // Reset initialization state
    this.initPromise = null;
    this.mongoDb = null;
    this.database = null;
    this.mongoClient = null;
    this.mongoServer = null;
  }
}
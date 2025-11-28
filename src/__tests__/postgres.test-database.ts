import { randomUUID } from 'crypto';
import testUtils from './common-test.utils.js';
import { initSystemUserContext } from '../config/base-api-config.js';
import { ITestDatabase } from './test-database.interface.js';
import { newDb } from "pg-mem";
import { Client } from 'pg';
import { setupDatabaseForMultitenant } from '../databases/postgres/migrations/setup-for-multitenant.migration.js';
import { setupDatabaseForAuth } from '../databases/postgres/migrations/setup-for-auth.migration.js';
import { runTestMigrations } from './postgres-test-migrations/run-test-migrations.js';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';
import { IDatabase } from '../databases/models/index.js';
/**
 * Utility class for setting up a PostgreSQL test database for testing
 * Implements ITestDatabase<Sql> interface
 */
export class TestPostgresDatabase implements ITestDatabase {
  private database: IDatabase | null = null;
  private postgresClient: Client | null = null;
  private initPromise: Promise<IDatabase> | null = null;
  private databaseName: string | null = null;
  /**
   * Initialize the PostgreSQL test database
   * @returns Promise resolving to the database client instance
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
    return randomUUID();
  }

  private async _performInit(databaseName: string): Promise<IDatabase> {
    this.databaseName = databaseName;
    // Set up PostgreSQL test database if not already done
    if (!this.database) {
      // Connect to the database using the postgres package
      const  {Client, Pool} = newDb().adapters.createPg();
      const postgresClient = new Client({
        database: databaseName
      });
      await postgresClient.connect();
      const testDatabase = new PostgresDatabase(postgresClient, databaseName);

      this.database = testDatabase;
      this.postgresClient = postgresClient;
      let success = await setupDatabaseForMultitenant(postgresClient, "test-org-id");
      if (!success) {
        throw new Error('Failed to setup for multitenant');
      }

      success = await setupDatabaseForAuth(postgresClient, "test-org-id");
      if (!success) {
        throw new Error('Failed to setup for auth');
      }

      success = await runTestMigrations(postgresClient, "test-org-id");
      if (!success) {
        throw new Error('Failed to run test migrations');
      }

      // Initialize test utilities with the database
      testUtils.initialize(testDatabase);
      await this.createIndexes(postgresClient);

      // Create meta org before initializing system user context
      await testUtils.createMetaOrg();
    }
    await initSystemUserContext(this.database);

    return this.database;
  }

  private async createIndexes(client: Client) {
    // Create indexes - keep this in sync with any production schema that is used for actual deployment
    // Create a unique, case-insensitive index on users.email (similar to MongoDB implementation)
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS email_index ON users (LOWER(email));
        CREATE UNIQUE INDEX IF NOT EXISTS email_unique_index ON users (LOWER(email));
      `);
    } catch (error: any) {
      // If tables don't exist yet, indexes will be created when tables are created
      // This is expected behavior for pg-mem as tables are created on-the-fly
      console.log('Note: Indexes may be created later when tables are initialized:', error.message);
    }
  }

  /**
   * Clear all tables in the database
   */
  async clearCollections(): Promise<void> {
    if (!this.postgresClient) {
      throw new Error('Database not initialized');
    }

    // Get all table names from the database
    const result = await this.postgresClient.query(`
      SELECT "table_name" 
      FROM information_schema.tables 
      WHERE "table_schema" = 'public'
      AND "table_type" = 'BASE TABLE'
    `);

    // Truncate all tables
    // pg-mem does not support truncating mutliple tables at once, so we need to truncate each table individually
    result.rows.forEach(async (row) => {
      await this.postgresClient?.query(`TRUNCATE TABLE "${row.table_name}" RESTART IDENTITY CASCADE`);
    });
  }

  /**
   * Clean up PostgreSQL resources
   */
  async cleanup(): Promise<void> {
    // Clean up test data first
    await testUtils.cleanup();

    if (!this.postgresClient) {
      throw new Error('Database not initialized');
    }

    // Clear all tables
    // try {
    //   const result = await this.postgresClient.query(`
    //     SELECT "table_name"
    //     FROM information_schema.tables 
    //     WHERE table_schema = 'public' 
    //     AND table_type = 'BASE TABLE';
    //   `);

    //   if (result.rows.length > 0) {
    //     const tableNames = result.rows.map(row => `"${row.tablename}"`).join(', ');
    //     await this.postgresClient.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
    //   }
    // } catch (error: any) {
    //   console.log('Error clearing tables during cleanup:', error.message);
    //   // Don't throw - cleanup should be non-blocking
    // }

    // Close the client connection
    await this.postgresClient.end();

    // Reset initialization state
    this.initPromise = null;
    this.database = null;
  }
}
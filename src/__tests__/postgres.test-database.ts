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
import { getSystemUserContext } from '@loomcore/common/models';
import { setTestMetaOrgId } from './test-objects.js';
/**
 * Utility class for setting up a PostgreSQL test database for testing
 * Implements ITestDatabase
 */
export class TestPostgresDatabase implements ITestDatabase {
  private database: IDatabase | null = null;
  private postgresClient: Client | null = null;
  private initPromise: Promise<IDatabase> | null = null;
  /**
   * Initialize the PostgreSQL test database
   * @returns Promise resolving to the database client instance
   */
  async init(adminUsername?: string, adminPassword?: string): Promise<IDatabase> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit(adminUsername, adminPassword);
    return this.initPromise;
  }

  getRandomId(): string {
    return randomUUID();
  }

  private async _performInit(adminUsername?: string, adminPassword?: string): Promise<IDatabase> {
    // Set up PostgreSQL test database if not already done
    if (!this.database) {
      // Create new test database client using pg-mem
      const { Client } = newDb().adapters.createPg();
      const postgresClient = new Client();
      await postgresClient.connect();
      const testDatabase = new PostgresDatabase(postgresClient);

      this.database = testDatabase;
      this.postgresClient = postgresClient;

      const multitenantResult = await setupDatabaseForMultitenant(postgresClient);
      let success = multitenantResult.success;
      if (!success) {
        throw new Error('Failed to setup for multitenant');
      }

      await initSystemUserContext(this.database);

      success = (await setupDatabaseForAuth(postgresClient)).success;
      if (!success) {
        throw new Error('Failed to setup for auth');
      }

      const systemUserContext = getSystemUserContext();

      if (systemUserContext._orgId) {
        setTestMetaOrgId(systemUserContext._orgId);
      }

      success = (await runTestMigrations(postgresClient, systemUserContext._orgId)).success;
      if (!success) {
        throw new Error('Failed to run test migrations');
      }

      // Initialize test utilities with the database
      testUtils.initialize(testDatabase);
      await this.createIndexes(postgresClient);

      // Create meta org before initializing system user context
      await testUtils.createMetaOrg();
    }

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
    // pg-mem does not support truncating mutliple tables at once yet, so we need to truncate each table individually
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

    // Close the client connection
    await this.postgresClient.end();

    // Reset initialization state
    this.initPromise = null;
    this.database = null;
  }
}
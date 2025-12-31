import testUtils from './common-test.utils.js';
import { ITestDatabase } from './test-database.interface.js';
import { newDb } from "pg-mem";
import { Client, Pool } from 'pg';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';
import { IDatabase } from '../databases/models/index.js';
import { config } from '../config/base-api-config.js';
import { runInitialSchemaMigrations, runTestSchemaMigrations } from '../databases/postgres/migrations/__tests__/test-migration-helper.js';
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
    // Note: PostgreSQL uses auto-generated integer IDs, so this should not be used for _id fields.
    // This method exists for interface compatibility and may be used for other string ID fields.
    // For _id fields, let the database auto-generate the ID.
    throw new Error('getRandomId() should not be used for PostgreSQL _id fields. PostgreSQL uses auto-generated integer IDs. Remove _id from entities and let the database generate it.');
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

      // Initialize system user context before running migrations
      // (migrations may need it, especially admin-user migration)
      const { initializeSystemUserContext, isSystemUserContextInitialized } = await import('@loomcore/common/models');
      if (!isSystemUserContextInitialized()) {
        // For multi-tenant, meta-org migration will initialize it properly
        // For non-multi-tenant, initialize with undefined org
        initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
      }

      // Create a Pool from the client for migrations
      // pg-mem's Client can be used as a Pool
      const pool = postgresClient as unknown as Pool;

      // Run initial schema migrations (includes all schema and data migrations based on config)
      await runInitialSchemaMigrations(pool, config);

      // Run test schema migrations (test-specific tables like testEntities, categories, products, testItems)
      await runTestSchemaMigrations(pool, config);

      // Initialize test utilities with the database
      testUtils.initialize(testDatabase);
      await this.createIndexes(postgresClient);

      // Create meta org (this will re-initialize system user context with the meta org if multi-tenant)
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
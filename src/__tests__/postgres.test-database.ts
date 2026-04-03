import testUtils from './common-test.utils.js';
import { ITestDatabase } from './test-database.interface.js';
import { newDb } from "pg-mem";
import { Pool, Client } from 'pg';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';
import type { PostgresConnection } from '../databases/postgres/postgres-connection.js';
import { IDatabase } from '../databases/models/index.js';
import { config } from '../config/base-api-config.js';
import { runInitialSchemaMigrations, runTestSchemaMigrations } from '../databases/postgres/migrations/__tests__/test-migration-helper.js';
/**
 * Check if we should use a real PostgreSQL container instead of pg-mem
 * Set USE_REAL_POSTGRES=true to use Docker container
 */
const USE_REAL_POSTGRES = process.env.USE_REAL_POSTGRES === 'true';

/**
 * Utility class for setting up a PostgreSQL test database for testing
 * Implements ITestDatabase
 * 
 * Supports both pg-mem (default) and real PostgreSQL container (via USE_REAL_POSTGRES=true)
 */
export class TestPostgresDatabase implements ITestDatabase {
  private database: IDatabase | null = null;
  /** Underlying pg handle (Pool when using real Postgres, Client for pg-mem). Exposed for tests via cast. */
  private postgresClient: PostgresConnection | null = null;
  private migrationPool: Pool | null = null;
  private initPromise: Promise<IDatabase> | null = null;
  /**
   * Initialize the PostgreSQL test database
   * @returns Promise resolving to the database client instance
   */
  async init(): Promise<IDatabase> {
    // Return existing promise if initialization is already in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create and cache the initialization promise
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  getRandomId(): string {
    // Note: PostgreSQL uses auto-generated integer IDs, so this should not be used for _id fields.
    // This method exists for interface compatibility and may be used for other string ID fields.
    // For _id fields, let the database auto-generate the ID.
    throw new Error('getRandomId() should not be used for PostgreSQL _id fields. PostgreSQL uses auto-generated integer IDs. Remove _id from entities and let the database generate it.');
  }

  private async _performInit(): Promise<IDatabase> {
    // Set up PostgreSQL test database if not already done
    if (!this.database) {
      let connection: PostgresConnection;
      let pool: Pool;

      if (USE_REAL_POSTGRES) {
        // Use real PostgreSQL container — one Pool for migrations and for PostgresDatabase
        const connectionString = `postgresql://test-user:test-password@localhost:5444/test-db`;
        pool = new Pool({
          connectionString,
          connectionTimeoutMillis: 5000, // 5 second timeout
        });
        this.migrationPool = pool;

        try {
          await pool.query('SELECT now(), current_database()');
        } catch (error: any) {
          await pool.end();
          this.migrationPool = null;
          const errorMessage = error.message || String(error);
          const isPermissionError = errorMessage.includes('permission denied') || errorMessage.includes('operation not permitted');

          if (isPermissionError) {
            throw new Error(
              `Docker permission error. Please ensure:\n` +
              `1. Docker Desktop is running\n` +
              `2. You have permission to access Docker (may need to restart Docker Desktop)\n` +
              `3. Try: docker ps (to verify Docker access)\n` +
              `Original error: ${errorMessage}`
            );
          }

          throw new Error(
            `Failed to connect to PostgreSQL test container at localhost:5444.\n` +
            `Make sure the container is running: npm run test:db:start\n` +
            `Check container status: docker ps | grep postgres-test\n` +
            `View container logs: npm run test:db:logs\n` +
            `Connection error: ${errorMessage}`
          );
        }

        connection = pool;
      } else {
        // Use pg-mem (default)
        const { Client } = newDb().adapters.createPg();
        const pgMemClient = new Client();
        await pgMemClient.connect();

        // pg-mem's Client can be used as a Pool
        pool = pgMemClient as unknown as Pool;
        connection = pgMemClient;
        this.migrationPool = pool;
      }
      this.database = new PostgresDatabase(connection);
      this.postgresClient = connection;

      // Initialize system user context before running migrations
      // (migrations may need it, especially admin-user migration)
      const { initializeSystemUserContext, isSystemUserContextInitialized } = await import('@loomcore/common/models');
      if (!isSystemUserContextInitialized()) {
        // For multi-tenant, meta-org migration will initialize it properly
        // For non-multi-tenant, initialize with undefined org
        initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
      }

      // Run initial schema migrations (includes all schema and data migrations based on config)
      await runInitialSchemaMigrations(pool, config);

      // Run test schema migrations (test-specific tables like testEntities, categories, products, testItems)
      await runTestSchemaMigrations(pool, config);

      // Initialize test utilities with the database
      testUtils.initialize(this.database);
      await this.createIndexes(connection);

      // Create meta org (this will re-initialize system user context with the meta org if multi-tenant)
      await testUtils.createMetaOrg();
    }

    return this.database;
  }

  private async createIndexes(connection: PostgresConnection) {
    // Create indexes - keep this in sync with any production schema that is used for actual deployment
    // Create a unique, case-insensitive index on users.email (similar to MongoDB implementation)
    try {
      await connection.query(`
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
    if (USE_REAL_POSTGRES) {
      await this.postgresClient.query(`TRUNCATE TABLE ${result.rows.map(row => `"${row.table_name}"`).join(', ')} RESTART IDENTITY CASCADE`);
    } else {
      // pg-mem does not support truncating mutliple tables at once yet, so we need to truncate each table individually
      result.rows.forEach(async (row) => {
        await this.postgresClient?.query(`TRUNCATE TABLE "${row.table_name}" RESTART IDENTITY CASCADE`);
      });
    }
  }

  /**
   * Clean up PostgreSQL resources
   */
  async cleanup(): Promise<void> {
    // Clean up test data first (only if database was initialized)
    if (this.database) {
      await testUtils.cleanup();
    }

    if (this.postgresClient) {
      try {
        if (this.postgresClient instanceof Pool) {
          await this.postgresClient.end();
        } else {
          await (this.postgresClient as Client).end();
        }
      } catch (error) {
        // Ignore errors during cleanup
        console.warn('Error closing PostgreSQL connection:', error);
      }
    }

    this.migrationPool = null;

    // Reset initialization state
    this.initPromise = null;
    this.database = null;
    this.postgresClient = null;
  }
}

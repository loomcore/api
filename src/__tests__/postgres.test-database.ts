import testUtils from './common-test.utils.js';
import { ITestDatabase } from './test-database.interface.js';
import { Client, Pool } from 'pg';
import { PostgresDatabase } from '../databases/postgres/postgres.database.js';
import { IDatabase } from '../databases/models/index.js';
import { config } from '../config/base-api-config.js';
import { runInitialSchemaMigrations, runTestSchemaMigrations } from '../databases/postgres/migrations/__tests__/test-migration-helper.js';

/** Docker Postgres test container connection (see docker-compose.test.yml). */
const TEST_POSTGRES_URL = 'postgresql://test-user:test-password@localhost:5444/test-db';

const CONNECTION_TIMEOUT_MS = 5000;
const CONNECT_RETRIES = 30;
const CONNECT_RETRY_DELAY_MS = 500;

/**
 * Connect to the test Postgres container with retries (e.g. while container is starting).
 */
async function connectWithRetry(): Promise<Client> {
  const client = new Client({
    connectionString: TEST_POSTGRES_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    try {
      await client.connect();
      return client;
    } catch (error: any) {
      lastError = error;
      const msg = error?.message ?? String(error);
      const isPermissionError = msg.includes('permission denied') || msg.includes('operation not permitted');
      if (isPermissionError) {
        throw new Error(
          `Docker permission error. Please ensure:\n` +
            `1. Docker Desktop is running\n` +
            `2. You have permission to access Docker (may need to restart Docker Desktop)\n` +
            `3. Try: docker ps (to verify Docker access)\n` +
            `Original error: ${msg}`
        );
      }
      if (attempt < CONNECT_RETRIES) {
        await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(
    `Failed to connect to PostgreSQL test container at localhost:5444 after ${CONNECT_RETRIES} attempts.\n` +
      `Make sure the container is running: npm run test:db:start\n` +
      `Or run: npm run test:postgres:real (starts container, runs tests, stops container)\n` +
      `Check container status: docker ps | grep postgres-test\n` +
      `View container logs: npm run test:db:logs\n` +
      `Connection error: ${(lastError as Error)?.message ?? lastError}`
  );
}

/**
 * Utility class for setting up a PostgreSQL test database for testing.
 * Implements ITestDatabase.
 * All tests use the Docker Postgres container (see docker-compose.test.yml).
 */
export class TestPostgresDatabase implements ITestDatabase {
  private database: IDatabase | null = null;
  private postgresClient: Client | null = null;
  private postgresPool: Pool | null = null;
  private initPromise: Promise<IDatabase> | null = null;

  async init(): Promise<IDatabase> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this._performInit();
    return this.initPromise;
  }

  getRandomId(): string {
    throw new Error(
      'getRandomId() should not be used for PostgreSQL _id fields. PostgreSQL uses auto-generated integer IDs. Remove _id from entities and let the database generate it.'
    );
  }

  private async _performInit(): Promise<IDatabase> {
    if (!this.database) {
      const postgresClient = await connectWithRetry();
      const pool = new Pool({
        connectionString: TEST_POSTGRES_URL,
        connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
      });

      this.postgresPool = pool;
      this.database = new PostgresDatabase(postgresClient);
      this.postgresClient = postgresClient;

      const { initializeSystemUserContext, isSystemUserContextInitialized } = await import('@loomcore/common/models');
      if (!isSystemUserContextInitialized()) {
        initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
      }

      await runInitialSchemaMigrations(pool, config);
      await runTestSchemaMigrations(pool, config);

      testUtils.initialize(this.database);
      await this.createIndexes(postgresClient);
      await testUtils.createMetaOrg();
    }

    return this.database;
  }

  private async createIndexes(client: Client) {
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS email_index ON users (LOWER(email));
        CREATE UNIQUE INDEX IF NOT EXISTS email_unique_index ON users (LOWER(email));
      `);
    } catch (error: any) {
      console.log('Note: Indexes may be created later when tables are initialized:', error.message);
    }
  }

  async clearCollections(): Promise<void> {
    if (!this.postgresClient) {
      throw new Error('Database not initialized');
    }

    const result = await this.postgresClient.query(`
      SELECT "table_name" 
      FROM information_schema.tables 
      WHERE "table_schema" = 'public'
      AND "table_type" = 'BASE TABLE'
    `);

    if (result.rows.length > 0) {
      const tables = result.rows.map((row) => `"${row.table_name}"`).join(', ');
      await this.postgresClient.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  }

  async cleanup(): Promise<void> {
    if (this.database) {
      await testUtils.cleanup();
    }

    if (this.postgresClient) {
      try {
        await this.postgresClient.end();
      } catch (error) {
        console.warn('Error closing PostgreSQL client:', error);
      }
    }

    if (this.postgresPool) {
      try {
        await this.postgresPool.end();
      } catch (error) {
        console.warn('Error closing PostgreSQL pool:', error);
      }
      this.postgresPool = null;
    }

    this.initPromise = null;
    this.database = null;
    this.postgresClient = null;
  }
}

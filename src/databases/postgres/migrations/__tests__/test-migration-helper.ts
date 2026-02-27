import { Client, Pool } from 'pg';
import { Umzug } from 'umzug';
import { IBaseApiConfig } from '../../../../models/base-api-config.interface.js';
import { IInitialDbMigrationConfig } from '../../../../models/initial-database-config.interface.js';
import { getPostgresInitialSchema } from '../postgres-initial-schema.js';
import { getPostgresTestSchema } from '../../../../__tests__/postgres-test-migrations/postgres-test-schema.js';

/**
 * Test helper to run only the postgres-initial-schema migrations (no file migrations)
 * This is used for tests in the API library to set up the database schema.
 */
export async function runInitialSchemaMigrations(pool: Pool, config: IBaseApiConfig): Promise<void> {
  const migrationConfig: IInitialDbMigrationConfig = {
    env: config.env || 'dev',
    app: config.app,
    database: config.database,
    adminUser: (config as any).adminUser ?? { email: 'admin@test.com', password: 'admin-password' },
    multiTenant: (config as any).multiTenant ?? (config.app.isMultiTenant ? { metaOrgName: 'Test Meta Organization', metaOrgCode: 'TEST_META_ORG' } : { metaOrgName: '', metaOrgCode: '' }),
    email: config.email,
  };
  const initialSchema = getPostgresInitialSchema(migrationConfig);

  const umzug = new Umzug({
    migrations: async () => {
      return initialSchema.map(m => ({
        name: m.name,
        up: async () => {
          await m.up({ context: pool });
        },
        down: async () => {
          await m.down({ context: pool });
        }
      }));
    },
    context: pool,
    storage: {
      async executed({ context }) {
        await context.query(`CREATE TABLE IF NOT EXISTS migrations (name text)`);
        const result = await context.query(`SELECT name FROM migrations`);
        return result.rows.map((r: any) => r.name);
      },
      async logMigration({ name, context }) {
        await context.query(`INSERT INTO migrations (name) VALUES ($1)`, [name]);
      },
      async unlogMigration({ name, context }) {
        await context.query(`DELETE FROM migrations WHERE name = $1`, [name]);
      }
    },
    logger: undefined,
  });

  await umzug.up();
}

/**
 * Test helper to run test schema migrations (test-specific tables)
 * This should be run after initial schema migrations in test environments.
 */
export async function runTestSchemaMigrations(pool: Pool, config: IBaseApiConfig): Promise<void> {
  const testSchema = getPostgresTestSchema(config);

  const umzug = new Umzug({
    migrations: async () => {
      return testSchema.map(m => ({
        name: m.name,
        up: async () => {
          await m.up({ context: pool });
        },
        down: async () => {
          await m.down({ context: pool });
        }
      }));
    },
    context: pool,
    storage: {
      async executed({ context }) {
        await context.query(`CREATE TABLE IF NOT EXISTS migrations (name text)`);
        const result = await context.query(`SELECT name FROM migrations`);
        return result.rows.map((r: any) => r.name);
      },
      async logMigration({ name, context }) {
        await context.query(`INSERT INTO migrations (name) VALUES ($1)`, [name]);
      },
      async unlogMigration({ name, context }) {
        await context.query(`DELETE FROM migrations WHERE name = $1`, [name]);
      }
    },
    logger: undefined,
  });

  await umzug.up();
}

/** Docker Postgres URL for the main test DB (see docker-compose.test.yml). */
const TEST_POSTGRES_URL = 'postgresql://test-user:test-password@localhost:5444/test-db';

/**
 * Create an isolated database on the Docker Postgres server for migration tests.
 * Each suite gets its own database so parallel runs don't conflict.
 * Call the returned `drop()` in afterAll to tear down.
 */
export async function createIsolatedMigrationDb(
  suiteName: string
): Promise<{ client: Client; pool: Pool; drop: () => Promise<void> }> {
  const safeName = suiteName.replace(/\W/g, '_').toLowerCase();
  const dbName = `test_migrations_${safeName}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const adminClient = new Client({
    connectionString: TEST_POSTGRES_URL,
    connectionTimeoutMillis: 5000,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE "${dbName}"`);
  await adminClient.end();

  const connectionString = `postgresql://test-user:test-password@localhost:5444/${dbName}`;
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });

  async function drop() {
    try {
      await client.end();
    } catch (e) {
      console.warn('Error closing migration test client:', e);
    }
    try {
      await pool.end();
    } catch (e) {
      console.warn('Error closing migration test pool:', e);
    }
    const dropClient = new Client({
      connectionString: TEST_POSTGRES_URL,
      connectionTimeoutMillis: 5000,
    });
    await dropClient.connect();
    await dropClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await dropClient.end();
  }

  return { client, pool, drop };
}


import { Pool } from 'pg';
import { Umzug } from 'umzug';
import { IBaseApiConfig } from '../../../../models/base-api-config.interface.js';
import { getPostgresInitialSchema } from '../postgres-initial-schema.js';
import { getPostgresTestSchema } from '../../../../__tests__/postgres-test-migrations/postgres-test-schema.js';
import { TestEmailClient } from '../../../../__tests__/test-email-client.js';

/**
 * Test helper to run only the postgres-initial-schema migrations (no file migrations)
 * This is used for tests in the API library to set up the database schema.
 */
export async function runInitialSchemaMigrations(pool: Pool, config: IBaseApiConfig): Promise<void> {
  const initialSchema = getPostgresInitialSchema(config, new TestEmailClient());

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


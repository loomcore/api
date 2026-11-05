import {
  initializeSystemUserContext,
  isSystemUserContextInitialized,
} from '@loomcore/common/models';
import type { Client, Pool } from 'pg';
import { newDb } from 'pg-mem';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';
import { config } from '../../../../config/base-api-config.js';
import { IInitialDbMigrationConfig } from '../../../../models/initial-database-config.interface.js';
import { getPostgresInitialSchema } from '../postgres-initial-schema.js';
import { runInitialSchemaMigrations } from './test-migration-helper.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';

describe.skipIf(!isPostgres)('setupDatabaseForMultitenant', () => {
  let client: Client;
  let pool: Pool;

  beforeAll(async () => {
    setupTestConfig(true, 'postgres');

    // Create a fresh in-memory PostgreSQL database for each test suite
    const { Client } = newDb().adapters.createPg();
    client = new Client();
    await client.connect();

    // Create a Pool from the client for migrations
    // pg-mem's Client can be used as a Pool
    pool = client as unknown as Pool;

    // Initialize system user context before running migrations
    // (meta-org migration will re-initialize it with the meta org)
    if (!isSystemUserContextInitialized()) {
      initializeSystemUserContext(
        config.email?.systemEmailAddress || 'system@test.com',
        undefined,
      );
    }

    // Run initial schema migrations (multi-tenant, so includes organizations and meta-org)
    await runInitialSchemaMigrations(pool, config);
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  it('should create migrations for organizations, users, and meta-org', async () => {
    // Act
    // Query migrations table to verify migration names exist
    const migrationsResult = await client.query(`
            SELECT name
            FROM migrations
            ORDER BY name
        `);

    const migrationNames = migrationsResult.rows.map(
      (row) => row.name as string,
    );

    // For multi-tenant, we expect at minimum:
    // - system-configurations (00000000000001)
    // - schema-organizations (00000000000002)
    // - schema-users (00000000000003)
    // - schema-refresh-tokens (00000000000004)
    // - schema-roles (00000000000006)
    // - schema-user-roles (00000000000007)
    // - schema-features (00000000000008)
    // - schema-authorizations (00000000000009)
    // - data-meta-org (00000000000010) - if metaOrgName and metaOrgCode are provided

    // Verify we have the expected schema migrations
    expect(migrationNames).toContain('00000000000001_system-configurations');
    expect(migrationNames).toContain('00000000000002_schema-organizations');
    expect(migrationNames).toContain(
      '00000000000002_schema-organizations-domains',
    );
    expect(migrationNames).toContain('00000000000003_schema-users');
    expect(migrationNames).toContain('00000000000004_schema-refresh-tokens');
    expect(migrationNames).toContain(
      '00000000000005_schema-password-reset-tokens',
    );
    expect(migrationNames).toContain('00000000000006_schema-roles');
    expect(migrationNames).toContain('00000000000007_schema-user-roles');
    expect(migrationNames).toContain('00000000000008_schema-features');
    expect(migrationNames).toContain('00000000000009_schema-authorizations');

    // Meta org is only created if metaOrgName and metaOrgCode are provided
    if (config.app.isMultiTenant) {
      expect(migrationNames).toContain('00000000000010_data-meta-org');
    }
  });

  it('should not create new migration entries when run a second time', async () => {
    // Arrange - get initial count
    const firstRunMigrations = await client.query(`
            SELECT name
            FROM migrations
            ORDER BY name
        `);
    const firstRunCount = firstRunMigrations.rows.length;

    // Act: Run migrations second time
    await runInitialSchemaMigrations(pool, config);

    // Get the count of migrations after second run
    const secondRunMigrations = await client.query(`
            SELECT name
            FROM migrations
            ORDER BY name
        `);
    const secondRunCount = secondRunMigrations.rows.length;
    const secondRunNames = secondRunMigrations.rows.map(
      (row) => row.name as string,
    );

    // Assert: Verify no new entries were added
    expect(secondRunCount).toBe(firstRunCount);
    expect(secondRunNames).toEqual(
      firstRunMigrations.rows.map((row) => row.name as string),
    );
  });
});

describe.skipIf(!isPostgres)('postgres initial schema meta-org seed', () => {
  it('stores a mixed-case metaOrgCode as lowercase', async () => {
    setupTestConfig(true, 'postgres');
    const { Client } = newDb().adapters.createPg();
    const client = new Client();
    await client.connect();
    const pool = client as unknown as Pool;

    if (!isSystemUserContextInitialized()) {
      initializeSystemUserContext(
        config.email?.systemEmailAddress || 'system@test.com',
        undefined,
      );
    }

    const dbConfig: IInitialDbMigrationConfig = {
      env: 'test',
      app: {
        isMultiTenant: true,
        isAuthEnabled: false,
        name: 'test-app',
        dbType: 'postgres',
      },
      database: {
        name: 'test-db',
        host: 'localhost',
        password: 'test-password',
        port: 5432,
        username: 'test-user',
      },
      adminUser: { email: 'admin@test.com', password: 'admin-password' },
      multiTenant: {
        metaOrgName: 'Mixed Case Meta',
        metaOrgCode: '  MetaOrg  ',
        metaOrgDomains: [],
      },
      email: config.email,
    };

    try {
      const migrations = getPostgresInitialSchema(dbConfig);
      for (const name of ['00000000000002_schema-organizations', '00000000000010_data-meta-org']) {
        const migration = migrations.find((item) => item.name === name);
        expect(migration, `missing migration ${name}`).toBeDefined();
        await migration!.up({ context: pool });
      }

      const result = await client.query(`SELECT code FROM organizations WHERE "is_meta_org" = TRUE`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].code).toBe('metaorg');
    } finally {
      await client.end();
    }
  });
});


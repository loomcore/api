import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, Pool } from 'pg';
import { isSystemUserContextInitialized, initializeSystemUserContext } from '@loomcore/common/models';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';
import { config } from '../../../../config/base-api-config.js';
import { runInitialSchemaMigrations, createIsolatedMigrationDb } from './test-migration-helper.js';

// Skip this test suite if not running with PostgreSQL
const isPostgres = process.env.TEST_DATABASE === 'postgres';

describe.skipIf(!isPostgres)('setupDatabaseForMultitenant', () => {
    let client: Client;
    let pool: Pool;
    let drop: () => Promise<void>;

    beforeAll(async () => {
        setupTestConfig(true, 'postgres');

        const isolated = await createIsolatedMigrationDb('setup-for-multitenant');
        client = isolated.client;
        pool = isolated.pool;
        drop = isolated.drop;

        if (!isSystemUserContextInitialized()) {
            initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
        }

        await runInitialSchemaMigrations(pool, config);
    });

    afterAll(async () => {
        await drop();
    });

    it('should create migrations for organizations, users, and meta-org', async () => {
        // Act 
        // Query migrations table to verify migration names exist
        const migrationsResult = await client.query(`
            SELECT name
            FROM migrations
            ORDER BY name
        `);

        const migrationNames = migrationsResult.rows.map((row) => row.name as string);

        // For multi-tenant, we expect at minimum:
        // - schema-organizations (00000000000001)
        // - schema-users (00000000000002)
        // - schema-refresh-tokens (00000000000003)
        // - schema-roles (00000000000004)
        // - schema-user-roles (00000000000005)
        // - schema-features (00000000000006)
        // - schema-authorizations (00000000000007)
        // - data-meta-org (00000000000008) - if metaOrgName and metaOrgCode are provided

        // Verify we have the expected schema migrations
        expect(migrationNames).toContain('00000000000001_schema-organizations');
        expect(migrationNames).toContain('00000000000002_schema-persons');
        expect(migrationNames).toContain('00000000000003_schema-users');
        expect(migrationNames).toContain('00000000000004_schema-refresh-tokens');
        expect(migrationNames).toContain('00000000000005_schema-password-reset-tokens');
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
        const secondRunNames = secondRunMigrations.rows.map((row) => row.name as string);

        // Assert: Verify no new entries were added
        expect(secondRunCount).toBe(firstRunCount);
        expect(secondRunNames).toEqual(firstRunMigrations.rows.map((row) => row.name as string));
    });
});


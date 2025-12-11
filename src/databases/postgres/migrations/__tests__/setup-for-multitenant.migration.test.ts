import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { setupDatabaseForMultitenant } from '../setup-for-multitenant.migration.js';
import { getTestMetaOrg } from '../../../../__tests__/test-objects.js';

describe('setupDatabaseForMultitenant', () => {
    let client: Client;

    beforeAll(async () => {
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should create migrations with indices 1, 2, and 5 on first run', async () => {
        // Arrange
        const metaOrg = getTestMetaOrg();

        // Act: Run setupDatabaseForMultitenant once
        const result = await setupDatabaseForMultitenant(client, metaOrg.name, metaOrg.code);

        // Assert: Verify success
        expect(result.success).toBe(true);
        expect(result.error).toBeNull();

        // Query migrations table to verify entries with index 1, 2, and 5 exist
        const migrationsResult = await client.query(`
            SELECT "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
            ORDER BY "index"
        `);

        const migrationIndices = migrationsResult.rows.map((row) => row.index as number);

        // Verify we have exactly 3 migrations
        expect(migrationIndices.length).toBe(3);

        // Verify we have migrations with indices 1, 2, and 5
        expect(migrationIndices).toContain(1);
        expect(migrationIndices).toContain(2);
        expect(migrationIndices).toContain(5);
    });

    it('should not create new migration entries when run a second time', async () => {
        // Arrange
        const metaOrg = getTestMetaOrg();

        // Act: Run setupDatabaseForMultitenant first time
        const firstResult = await setupDatabaseForMultitenant(client, metaOrg.name, metaOrg.code);
        expect(firstResult.success).toBe(true);

        // Get the count of migrations after first run
        const firstRunMigrations = await client.query(`
            SELECT "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
            ORDER BY "index"
        `);
        const firstRunCount = firstRunMigrations.rows.length;
        const firstRunIndices = firstRunMigrations.rows.map((row) => row.index as number);

        // Act: Run setupDatabaseForMultitenant second time
        const secondResult = await setupDatabaseForMultitenant(client, metaOrg.name, metaOrg.code);
        expect(secondResult.success).toBe(true);

        // Get the count of migrations after second run
        const secondRunMigrations = await client.query(`
            SELECT "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
            ORDER BY "index"
        `);
        const secondRunCount = secondRunMigrations.rows.length;
        const secondRunIndices = secondRunMigrations.rows.map((row) => row.index as number);

        // Assert: Verify no new entries were added
        expect(secondRunCount).toBe(firstRunCount);
        expect(secondRunIndices).toEqual(firstRunIndices);
        expect(secondRunIndices).toEqual([1, 2, 5]);
    });
});


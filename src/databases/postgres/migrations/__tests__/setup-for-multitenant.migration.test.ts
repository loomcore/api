import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';
import { DatabaseBuilder } from '../database-builder.js';

describe('setupDatabaseForMultitenant', () => {
    let client: Client;

    beforeAll(async () => {
        setupTestConfig();
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();
        const builder = new DatabaseBuilder(client);
        const result = await builder.withMultitenant().build();
        expect(result.success).toBe(true);
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should create migrations with indices 1, 2, and 5 on first run', async () => {

        // Act 
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
        const builder = new DatabaseBuilder(client);

        // Act: Run setupDatabaseForMultitenant second time
        const secondResult = await builder.withMultitenant().build();

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
        expect(secondRunCount).toBe(3);
        expect(secondRunIndices).toEqual([1, 2, 5]);
        expect(secondResult.success).toBe(true);
        expect(secondResult.error).toBeNull();
    });
});


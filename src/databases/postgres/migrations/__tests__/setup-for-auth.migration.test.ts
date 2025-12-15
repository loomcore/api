import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { isSystemUserContextInitialized, initializeSystemUserContext } from '@loomcore/common/models';
import { config } from '../../../../config/base-api-config.js';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';
import { DatabaseBuilder } from '../database-builder.js';

describe('setupDatabaseForAuth', () => {
    let client: Client;

    beforeAll(async () => {
        setupTestConfig(false);
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();

        // Since isMultiTenant is false, we initialize with undefined orgId
        if (!isSystemUserContextInitialized()) {
            initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
        }

        const builder = new DatabaseBuilder(client);
        const result = await builder.withAuth().build();
        expect(result.success).toBe(true);
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should create migrations with indices 1, 3, 4, 6, 7, 8, 9, 10, and 11 on first run', async () => {

        // Act 
        // Query migrations table to verify entries with index 1, 3, 4, 6, 7, 8, 9, 10, and 11 exist
        const migrationsResult = await client.query(`
            SELECT "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
            ORDER BY "index"
        `);

        const migrationIndices = migrationsResult.rows.map((row) => row.index as number);

        // Verify we have exactly 9 migrations
        expect(migrationIndices.length).toBe(9);

        // Verify we have migrations with indices 1, 3, 4, 6, 7, 8, 9, 10, and 11
        expect(migrationIndices).toContain(1);
        expect(migrationIndices).toContain(3);
        expect(migrationIndices).toContain(4);
        expect(migrationIndices).toContain(6);
        expect(migrationIndices).toContain(7);
        expect(migrationIndices).toContain(8);
        expect(migrationIndices).toContain(9);
        expect(migrationIndices).toContain(10);
        expect(migrationIndices).toContain(11);
    });

    it('should not create new migration entries when run a second time', async () => {
        // Arrange
        const builder = new DatabaseBuilder(client);

        // Act: Run setupDatabaseForAuth second time
        const secondResult = await builder.withAuth().build();

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
        expect(secondRunCount).toBe(9);
        expect(secondRunIndices).toEqual([1, 3, 4, 6, 7, 8, 9, 10, 11]);
        expect(secondResult.success).toBe(true);
        expect(secondResult.error).toBeNull();
    });
});

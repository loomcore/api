import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { setupDatabaseForMultitenant } from '../setup-for-multitenant.migration.js';
import { setupDatabaseForAuth } from '../setup-for-auth.migration.js';
import { PostgresDatabase } from '../../postgres.database.js';
import { UserService } from '../../../../services/user-service/user.service.js';
import { getSystemUserContext } from '@loomcore/common/models';
import { config } from '../../../../config/base-api-config.js';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';

describe('setupDatabaseForAuth', () => {
    let client: Client;
    let database: PostgresDatabase;

    beforeAll(async () => {
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();
        database = new PostgresDatabase(client);

        setupTestConfig();

        // Set up multitenant first (required before auth setup)
        const multitenantResult = await setupDatabaseForMultitenant(client);
        if (!multitenantResult.success) {
            throw new Error('Failed to setup for multitenant');
        }
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should return admin user with authorization array after running setupDatabaseForAuth', async () => {
        // Arrange

        const systemUserContext = getSystemUserContext();

        // Act: Run setupDatabaseForAuth
        const result = await setupDatabaseForAuth(client);

        // Assert: Verify success
        expect(result.success).toBe(true);
        expect(result.error).toBeNull();

        // Get all users using UserService
        const userService = new UserService(database);
        const allUsers = await userService.getAll(systemUserContext);

        // Find the admin user by email
        // Note: The admin user should exist after setupDatabaseForAuth runs
        const adminUser = allUsers.find(user => user.email === config.adminUser?.email);

        // Assert: Verify admin user exists
        // If this fails, it means migration 6 (CreateAdminUserMigration) didn't run successfully
        expect(adminUser).toBeDefined();
        expect(adminUser?.email).toBe(config.adminUser?.email);

        // Assert: Verify admin user has authorizations array with one entry
        // This test should fail because currently the authorizations array is empty
        // The expected behavior is that it should contain: [{ role: "admin", feature: "admin" }]
        expect(adminUser?.authorizations).toBeDefined();
        expect(Array.isArray(adminUser?.authorizations)).toBe(true);
        expect(adminUser?.authorizations?.length).toBe(1);

        // Assert: Verify the authorization entry matches expected structure
        const authorization = adminUser?.authorizations?.[0];

        expect(authorization).toBeDefined();
        expect(authorization?.role).toBe('admin');
        expect(authorization?.feature).toBe('admin');
    });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { PostgresDatabase } from '../../postgres.database.js';
import { UserService } from '../../../../services/user-service/user.service.js';
import { getSystemUserContext, isSystemUserContextInitialized, initializeSystemUserContext } from '@loomcore/common/models';
import { config, initSystemUserContext } from '../../../../config/base-api-config.js';
import { setupTestConfig } from '../../../../__tests__/common-test.utils.js';
import { getTestMetaOrg } from '../../../../__tests__/test-objects.js';
import { DatabaseBuilder } from '../database-builder.js';

describe('setupDatabaseForAuth', () => {
    let client: Client;
    let database: PostgresDatabase;

    beforeAll(async () => {
        setupTestConfig(false);
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();
        database = new PostgresDatabase(client);

        // Initialize system user context before running migrations since migration 6 needs it
        // Since isMultiTenant is false, we initialize with undefined orgId
        if (!isSystemUserContextInitialized()) {
            initializeSystemUserContext(config.email?.systemEmailAddress || 'system@test.com', undefined);
        }

        const builder = new DatabaseBuilder(client);
        await builder.withAuth().build();
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should return admin user with authorization array after running setupDatabaseForAuth', async () => {
        // Arrange
        const systemUserContext = getSystemUserContext();

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

        expect(adminUser?._orgId).toBe(config.app.isMultiTenant ? getTestMetaOrg()._id : undefined);

        // Assert: Verify admin user has authorizations array with one entry
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

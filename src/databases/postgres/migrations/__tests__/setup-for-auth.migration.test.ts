import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb } from 'pg-mem';
import { Client } from 'pg';
import { setupDatabaseForMultitenant } from '../setup-for-multitenant.migration.js';
import { setupDatabaseForAuth } from '../setup-for-auth.migration.js';
import { getTestMetaOrg, setTestMetaOrgId } from '../../../../__tests__/test-objects.js';
import { PostgresDatabase } from '../../postgres.database.js';
import { UserService } from '../../../../services/user-service/user.service.js';
import { getSystemUserContext } from '@loomcore/common/models';
import { initSystemUserContext } from '../../../../config/base-api-config.js';
import { setBaseApiConfig } from '../../../../config/base-api-config.js';

describe('setupDatabaseForAuth', () => {
    let client: Client;
    let database: PostgresDatabase;

    beforeAll(async () => {
        // Create a fresh in-memory PostgreSQL database for each test suite
        const { Client } = newDb().adapters.createPg();
        client = new Client();
        await client.connect();
        database = new PostgresDatabase(client);

        // Set up base API config (required for initSystemUserContext)
        setBaseApiConfig({
            env: 'test',
            hostName: 'localhost',
            appName: 'test-app',
            clientSecret: 'test-secret',
            database: {
                name: 'test-db',
            },
            externalPort: 4000,
            internalPort: 8083,
            corsAllowedOrigins: ['*'],
            saltWorkFactor: 10,
            jobTypes: '',
            deployedBranch: '',
            debug: {
                showErrors: false
            },
            app: { isMultiTenant: true },
            auth: {
                jwtExpirationInSeconds: 3600,
                refreshTokenExpirationInDays: 7,
                deviceIdCookieMaxAgeInDays: 730,
                passwordResetTokenExpirationInMinutes: 20
            },
            email: {
                emailApiKey: 'WeDontHaveAKeyYet',
                emailApiSecret: 'WeDontHaveASecretYet',
                fromAddress: undefined
            }
        });

        // Set up multitenant first (required before auth setup)
        const metaOrg = getTestMetaOrg();
        const multitenantResult = await setupDatabaseForMultitenant(client, metaOrg.name, metaOrg.code);
        if (!multitenantResult.success || !multitenantResult.metaOrgId) {
            throw new Error('Failed to setup for multitenant');
        }
        setTestMetaOrgId(multitenantResult.metaOrgId);

        // Initialize system user context (required for UserService)
        await initSystemUserContext(database);
    });

    afterAll(async () => {
        if (client) {
            await client.end();
        }
    });

    it('should return admin user with authorization array after running setupDatabaseForAuth', async () => {
        // Arrange
        const adminEmail = 'admin@example.com';
        const adminPassword = 'password';
        const systemUserContext = getSystemUserContext();

        // Act: Run setupDatabaseForAuth
        const result = await setupDatabaseForAuth(client, adminEmail, adminPassword, systemUserContext._orgId);

        // Assert: Verify success
        expect(result.success).toBe(true);
        expect(result.error).toBeNull();

        // Get all users using UserService
        const userService = new UserService(database);
        const allUsers = await userService.getAll(systemUserContext);

        // Find the admin user by email
        // Note: The admin user should exist after setupDatabaseForAuth runs
        const adminUser = allUsers.find(user => user.email === adminEmail);

        // Assert: Verify admin user exists
        // If this fails, it means migration 6 (CreateAdminUserMigration) didn't run successfully
        expect(adminUser).toBeDefined();
        expect(adminUser?.email).toBe(adminEmail);

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

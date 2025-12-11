import { Client } from "pg";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-tokens-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { CreateAdminUserMigration } from "./006-create-admin-user.migration.js";
import { CreateUserRolesTableMigration } from "./008-create-user-roles-table.migration.js";
import { CreateRoleTableMigration } from "./007-create-roles-table.migration.js";
import { CreateAuthorizationsTableMigration } from "./010-create-authorizations-table.migration.js";
import { CreateFeaturesTableMigration } from "./009-create-features-table.migration.js";
import { CreateAdminAuthorizationMigration } from "./011-create-admin-authorization.migration.js";

export async function setupDatabaseForAuth(client: Client, adminUsername: string, adminPassword: string, metaOrgId?: string): Promise<{ success: boolean, error: Error | null }> {
    let runMigrations: number[] = [];

    if (await doesTableExist(client, 'migrations')) {
        const migrations = await client.query(`
            SELECT "_id", "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
        `);
        runMigrations = migrations.rows.map((row) => {
            return row.index as number;
        });
    }

    let adminUserId: string | undefined;
    if (!runMigrations.includes(1)) {
        const migration = new CreateMigrationTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating migrations table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(3)) {
        const migration = new CreateUsersTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating users table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(4)) {
        const migration = new CreateRefreshTokenTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating refresh_tokens table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(6)) {
        const migration = new CreateAdminUserMigration(client);
        const result = await migration.execute(adminUsername, adminPassword);
        adminUserId = result.adminUserId;
    }
    if (!runMigrations.includes(7)) {
        const migration = new CreateRoleTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating roles table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(8)) {
        const migration = new CreateUserRolesTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating user_roles table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(9)) {
        const migration = new CreateFeaturesTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating features table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(10)) {
        const migration = new CreateAuthorizationsTableMigration(client);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating authorizations table', result.error);
            return { success: false, error: result.error };
        }
    }
    if (!runMigrations.includes(11)) {
        if (!adminUserId) {
            console.error('setupDatabaseForAuth: Admin user ID is required');
            return { success: true, error: null };
        }
        const migration = new CreateAdminAuthorizationMigration(client, adminUserId, metaOrgId);
        const result = await migration.execute();
        if (!result.success) {
            console.error('setupDatabaseForAuth: error creating admin authorization', result.error);
            return { success: false, error: result.error };
        }
    }

    return { success: true, error: null };
}
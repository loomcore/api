import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-tokens-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { CreateAdminUserMigration } from "./006-create-admin-user.migration.js";
import { getSystemUserContext } from "@loomcore/common/models";
import { CreateUserRolesTableMigration } from "./008-create-user-roles-table.migration.js";
import { CreateRoleTableMigration } from "./007-create-roles-table.migration.js";
import { CreateAuthorizationsTableMigration } from "./010-create-authorizations-table.migration.js";
import { CreateFeaturesTableMigration } from "./009-create-features-table.migration.js";

export async function setupDatabaseForAuth(client: Client, adminUsername: string, adminPassword: string): Promise<{ success: boolean, error: Error | null }> {
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

    let migrationsToRun: IMigration[] = [];

    if (!runMigrations.includes(1))
        migrationsToRun.push(new CreateMigrationTableMigration(client));
    if (!runMigrations.includes(3))
        migrationsToRun.push(new CreateUsersTableMigration(client));
    if (!runMigrations.includes(4))
        migrationsToRun.push(new CreateRefreshTokenTableMigration(client));
    if (!runMigrations.includes(6))
        migrationsToRun.push(new CreateAdminUserMigration(client, adminUsername, adminPassword));
    if (!runMigrations.includes(7))
        migrationsToRun.push(new CreateRoleTableMigration(client));
    if (!runMigrations.includes(8))
        migrationsToRun.push(new CreateUserRolesTableMigration(client));
    if (!runMigrations.includes(9))
        migrationsToRun.push(new CreateFeaturesTableMigration(client));
    if (!runMigrations.includes(10))
        migrationsToRun.push(new CreateAuthorizationsTableMigration(client));


    for (const migration of migrationsToRun) {
        await migration.execute();
    }

    return { success: true, error: null };
}
import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-tokens-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { CreateAdminUserMigration } from "./006-create-admin-user.migration.js";

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

    for (const migration of migrationsToRun) {
        await migration.execute();
    }

    return { success: true, error: null };
}
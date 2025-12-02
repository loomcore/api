import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-token-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";

export async function setupDatabaseForAuth(client: Client, _orgId?: string): Promise<{success: boolean, error: Error | null}> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client),
        new CreateUsersTableMigration(client),
        new CreateRefreshTokenTableMigration(client),
    ];

    try {
        for (const migration of migrations) {
            await migration.execute(_orgId);
        }
    } catch (error: any) {
        return { success: false, error: error };
    }
    return { success: true, error: null };
}
import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-token-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";

export async function setupDatabaseForAuth(client: Client, orgId?: string): Promise<{success: boolean, error: Error | null}> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client, orgId),
        new CreateUsersTableMigration(client, orgId),
        new CreateRefreshTokenTableMigration(client, orgId),
    ];

    try {
        for (const migration of migrations) {
            await migration.execute();
        }
    } catch (error: any) {
        return { success: false, error: error };
    }
    return { success: true, error: null };
}
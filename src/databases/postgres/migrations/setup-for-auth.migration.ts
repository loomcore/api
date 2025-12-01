import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-token-table.migration.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";

export async function setupDatabaseForAuth(client: Client, orgId?: string): Promise<boolean> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client, orgId),
        new CreateUsersTableMigration(client, orgId),
        new CreateRefreshTokenTableMigration(client, orgId),
    ];

    let success = true;
    for (const migration of migrations) {
        success = await migration.execute();
        if (!success) {
            return false;
        }
    }

    return success;
}
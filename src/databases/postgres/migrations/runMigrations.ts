import { Client } from "pg";
import { CreateMigrationTableMigration, CreateOrganizationTableMigration, CreateUsersTableMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-token-table.migration.js";

export async function runMigrations(client: Client, version: number | null = null): Promise<boolean> {

    const migrations = [
        new CreateMigrationTableMigration(client),
        new CreateOrganizationTableMigration(client),
        new CreateUsersTableMigration(client),
        new CreateRefreshTokenTableMigration(client),
    ];


    let success = true;
    for (const migration of migrations) {
        if (version === null || migration.id <= version) {
            success = await migration.execute();
            if (!success) {
                return false;
            }
        }
    }

    return success;
}
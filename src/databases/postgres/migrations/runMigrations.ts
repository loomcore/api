import { Client } from "pg";
import { CreateMigrationTableMigration, CreateOrganizationTableMigration, CreateUsersTableMigration, IMigration } from "./index.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-token-table.migration.js";

export async function runMigrations(client: Client, orgId: string, version: number | null = null): Promise<boolean> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client, orgId),
        new CreateOrganizationTableMigration(client, orgId),
        new CreateUsersTableMigration(client, orgId),
        new CreateRefreshTokenTableMigration(client, orgId),
    ];

    let success = true;
    for (const migration of migrations) {
        if (version === null || migration.index <= version) {
            success = await migration.execute();
            if (!success) {
                return false;
            }
        }
    }

    return success;
}
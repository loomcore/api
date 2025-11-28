import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateOrganizationTableMigration } from "./002-create-organizations-table.migration.js";

export async function setupDatabaseForMultitenant(client: Client, orgId: string): Promise<boolean> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client, orgId),
        new CreateOrganizationTableMigration(client, orgId),
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
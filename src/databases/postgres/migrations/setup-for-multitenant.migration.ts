import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateOrganizationTableMigration } from "./002-create-organizations-table.migration.js";

export async function setupDatabaseForMultitenant(client: Client, orgId: string): Promise<{success: boolean, error: Error | null}> {
    const migrations: IMigration[] = [
        new CreateMigrationTableMigration(client, orgId),
        new CreateOrganizationTableMigration(client, orgId),
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
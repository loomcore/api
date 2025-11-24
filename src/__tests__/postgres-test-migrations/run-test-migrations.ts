import { Client } from "pg";
import { CreateTestEntitiesTableMigration } from "./001-create-test-entities-table.migration.js";

export async function runTestMigrations(client: Client, orgId: string): Promise<boolean> {
    const migrations = [
        new CreateTestEntitiesTableMigration(client, orgId),
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
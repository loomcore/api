import { Client } from "pg";
import { CreateTestEntitiesTableMigration } from "./001-create-test-entities-table.migration.js";
import { CreateCategoriesTableMigration } from "./002-create-categories-table.migration.js";
import { CreateProductsTableMigration } from "./003-create-products-table.migration.js";
import { CreateTestUsersTableMigration } from "./004-create-test-users-table.migration.js";
import { CreateTestItemsTableMigration } from "./005-create-test-items-table.migration.js";

export async function runTestMigrations(client: Client, orgId?: string): Promise<boolean> {
    const migrations = [
        new CreateTestEntitiesTableMigration(client, orgId),
        new CreateCategoriesTableMigration(client, orgId),
        new CreateProductsTableMigration(client, orgId),
        new CreateTestUsersTableMigration(client, orgId),
        new CreateTestItemsTableMigration(client, orgId),
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
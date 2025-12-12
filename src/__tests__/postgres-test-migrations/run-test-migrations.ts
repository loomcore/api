import { Client } from "pg";
import { CreateTestEntitiesTableMigration } from "./001-create-test-entities-table.migration.js";
import { CreateCategoriesTableMigration } from "./002-create-categories-table.migration.js";
import { CreateProductsTableMigration } from "./003-create-products-table.migration.js";
import { CreateTestItemsTableMigration } from "./005-create-test-items-table.migration.js";

export async function runTestMigrations(client: Client, _orgId?: string): Promise<{ success: boolean, error: Error | null }> {
    const migrations = [
        new CreateTestEntitiesTableMigration(client),
        new CreateCategoriesTableMigration(client),
        new CreateProductsTableMigration(client),
        new CreateTestItemsTableMigration(client),
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
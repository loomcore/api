import { Client } from "pg";
import { CreateTestEntitiesTableMigration } from "./100-create-test-entities-table.migration.js";
import { CreateCategoriesTableMigration } from "./101-create-categories-table.migration.js";
import { CreateProductsTableMigration } from "./102-create-products-table.migration.js";
import { CreateTestItemsTableMigration } from "./103-create-test-items-table.migration.js";
import { IMigration } from "../../databases/index.js";

export const testMigrations = (client: Client): IMigration[] => {
    return [
        new CreateTestEntitiesTableMigration(client),
        new CreateCategoriesTableMigration(client),
        new CreateProductsTableMigration(client),
        new CreateTestItemsTableMigration(client),
    ];
}
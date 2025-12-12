import { Client } from "pg";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateOrganizationsTableMigration } from "./002-create-organizations-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { CreateMetaOrgMigration } from "./005-create-meta-org.migration.js";

export async function setupDatabaseForMultitenant(client: Client) {
    let runMigrations: number[] = [];

    if (await doesTableExist(client, 'migrations')) {
        const migrations = await client.query(`
            SELECT "_id", "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE
        `);
        runMigrations = migrations.rows.map((row) => {
            return row.index as number;
        });
    }

    if (!runMigrations.includes(1)) {
        const createMigrationTableMigration = new CreateMigrationTableMigration(client);
        const result = await createMigrationTableMigration.execute();
        if (!result.success) {
            console.log('setupDatabaseForMultitenant: error creating migration table', result.error);
            return result;
        }
    }

    if (!runMigrations.includes(2)) {
        const createOrganizationTableMigration = new CreateOrganizationsTableMigration(client);
        const result = await createOrganizationTableMigration.execute();
        if (!result.success) {
            console.log('setupDatabaseForMultitenant: error creating organizations table', result.error);
            return result;
        }
    }

    if (!runMigrations.includes(5)) {
        const createMetaOrgMigration = new CreateMetaOrgMigration(client);
        const result = await createMetaOrgMigration.execute();
        if (!result.success) {
            console.log('setupDatabaseForMultitenant: error creating meta org', result.error);
            return result;
        }
    }

    return { success: true, error: null };
}

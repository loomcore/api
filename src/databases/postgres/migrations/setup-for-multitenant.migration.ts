import { Client } from "pg";
import { IMigration } from "./index.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateOrganizationTableMigration } from "./002-create-organizations-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";

export async function setupDatabaseForMultitenant(client: Client, orgName: string, orgCode: string): Promise<{success: boolean, error: Error | null}> {
    let runMigrations: number[] = [];
    if (await doesTableExist(client, 'migrations')) {
        const migrations = await client.query(`
            SELECT "_id", "index"
            FROM migrations
            WHERE "hasRun" = TRUE AND "reverted" = FALSE AND "_orgId" IS NULL
        `);
        runMigrations = migrations.rows.map((row) => {
            return row.index as number;
        });
    }

    let migrationsToRun: IMigration[] = [];

    if (!runMigrations.includes(1))
        migrationsToRun.push(new CreateMigrationTableMigration(client));
    if (!runMigrations.includes(2))
        migrationsToRun.push(new CreateOrganizationTableMigration(client, orgName, orgCode));

    try {
        for (const migration of migrationsToRun) {
            await migration.execute();
        }
    } catch (error: any) {
        return { success: false, error: error };
    }
    return { success: true, error: null };
}
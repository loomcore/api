import { Client } from "pg";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateOrganizationsTableMigration } from "./002-create-organizations-table.migration.js";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { CreateMetaOrgMigration } from "./005-create-meta-org.migration.js";
import { randomUUID } from 'crypto';
import { PostgresDatabase } from "../postgres.database.js";
import { OrganizationService } from "../../../services/index.js";
import { EmptyUserContext } from "@loomcore/common/models";

export async function setupDatabaseForMultitenant(client: Client, orgName: string, orgCode: string): Promise<{ success: boolean, metaOrgId: string | undefined, error: Error | null }> {
    let runMigrations: number[] = [];
    let metaOrgId: string = randomUUID().toString();

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
            return { success: false, metaOrgId: metaOrgId, error: result.error };
        }
    }

    if (!runMigrations.includes(2)) {
        const createOrganizationTableMigration = new CreateOrganizationsTableMigration(client, orgName, orgCode);
        const result = await createOrganizationTableMigration.execute();
        if (!result.success) {
            console.log('setupDatabaseForMultitenant: error creating organizations table', result.error);
            return { success: false, metaOrgId: metaOrgId, error: result.error };
        }
    } else {
        const database = new PostgresDatabase(client);
        const organizationService = new OrganizationService(database);
        const metaOrg = await organizationService.getMetaOrg(EmptyUserContext);
        if (metaOrg) {
            metaOrgId = metaOrg._id;
        }
    }

    if (!runMigrations.includes(5)) {
        const createMetaOrgMigration = new CreateMetaOrgMigration(client, orgName, orgCode);
        const result = await createMetaOrgMigration.execute();
        if (!result.success || !result.metaOrgId) {
            console.log('setupDatabaseForMultitenant: error creating meta org', result.error);
            return { success: false, metaOrgId: metaOrgId, error: result.error };
        }
    }

    return { success: true, metaOrgId: metaOrgId, error: null };
}

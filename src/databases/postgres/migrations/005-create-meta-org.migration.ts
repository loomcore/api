import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { config } from "../../../config/index.js";
import { initializeSystemUserContext, IOrganization } from "@loomcore/common/models";

export class CreateMetaOrgMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 5;

    async execute() {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            const orgResult = await this.client.query(`
                INSERT INTO "organizations" ("_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy")
                VALUES ('${_id}', '${config.app.metaOrgName}', '${config.app.metaOrgCode}', 1, true, NOW(), 'system', NOW(), 'system')
                RETURNING "_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy";
            `);

            if (orgResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error creating meta org: No row returned`) };
            }

            initializeSystemUserContext(config.email?.systemEmailAddress || 'system@example.com', orgResult.rows[0] as IOrganization);

            const migrationResult = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (migrationResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error executing migration ${this.index}: ${error.message}`) };
        }
    }

    async revert() {
        try {
            await this.client.query('BEGIN');

            const deleteResult = await this.client.query(`DELETE FROM "organizations" WHERE "isMetaOrg" = TRUE;`);
            if (deleteResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error reverting meta org: No row returned`) };
            }

            const updateResult = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (updateResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error updating migration record for index ${this.index}: No row returned`) };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error reverting migration ${this.index}: ${error.message}`) };
        }
    }
}

export default CreateMetaOrgMigration;
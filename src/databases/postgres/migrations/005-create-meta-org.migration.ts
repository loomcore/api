import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

//TODO: merge these into an atomic transaction
export class CreateMetaOrgMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgName: string, private readonly orgCode: string) {
    }

    index = 5;

    async execute() {
        const _id = randomUUID().toString();

        try {
            const result =await this.client.query(`
                INSERT INTO "organizations" ("_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy")
                VALUES ('${_id}', '${this.orgName}', '${this.orgCode}', 1, true, NOW(), 'system', NOW(), 'system');`);
            
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error creating meta org: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating meta org: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, metaOrgId: _id, error: null };
    }

    async revert() {
        try {
            const result = await this.client.query(`DELETE FROM "organizations" WHERE "isMetaOrg" = TRUE;`);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error reverting meta org: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error reverting meta org: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error updating migration record for index ${this.index}: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record for index ${this.index}: ${error.message}`) };
        }   

        return { success: true, error: null };
    }
}

export default CreateMetaOrgMigration;
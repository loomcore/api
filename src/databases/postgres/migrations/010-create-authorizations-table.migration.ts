import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { doesTableExist } from "../utils/does-table-exist.util.js";

export class CreateAuthorizationsTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 10;

    async execute() {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'authorizations');

            if (!tableExists) {
                await this.client.query(`
                    CREATE TABLE "authorizations" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "_orgId" VARCHAR(255),
                        "_roleId" VARCHAR(255) NOT NULL,
                        "_featureId" VARCHAR(255) NOT NULL,
                        "startDate" TIMESTAMP,
                        "endDate" TIMESTAMP,
                        "config" JSONB,
                        "_created" TIMESTAMP NOT NULL,
                        "_createdBy" VARCHAR(255) NOT NULL,
                        "_updated" TIMESTAMP NOT NULL,
                        "_updatedBy" VARCHAR(255) NOT NULL,
                        "_deleted" TIMESTAMP,
                        "_deletedBy" VARCHAR(255),
                        CONSTRAINT "fk_authorizations_organization" FOREIGN KEY ("_orgId") REFERENCES "organizations"("_id") ON DELETE CASCADE,
                        CONSTRAINT "fk_authorizations_role" FOREIGN KEY ("_roleId") REFERENCES "roles"("_id") ON DELETE CASCADE,
                        CONSTRAINT "fk_authorizations_feature" FOREIGN KEY ("_featureId") REFERENCES "features"("_id") ON DELETE CASCADE,
                        CONSTRAINT "uk_authorizations" UNIQUE ("_orgId", "_roleId", "_featureId")
                    )
                `);
            }

            const result = await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${_id}', ${this.index}, TRUE, FALSE);
                `);

            if (result.rowCount === 0) {
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

            await this.client.query(`
                DROP TABLE "authorizations";
            `);

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

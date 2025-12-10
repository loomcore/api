import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { doesTableExist } from "../utils/does-table-exist.util.js";

export class CreateOrganizationsTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgName: string, private readonly orgCode: string) {
    }

    index = 2;

    async execute() {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'organizations');

            if (!tableExists) {
                await this.client.query(`
                    CREATE TABLE "organizations" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "name" VARCHAR(255) NOT NULL UNIQUE,
                        "code" VARCHAR(255) NOT NULL UNIQUE,
                        "description" TEXT,
                        "status" INTEGER NOT NULL,
                        "isMetaOrg" BOOLEAN NOT NULL UNIQUE,
                        "authToken" TEXT,
                        "_created" TIMESTAMP NOT NULL,
                        "_createdBy" VARCHAR(255) NOT NULL,
                        "_updated" TIMESTAMP NOT NULL,
                        "_updatedBy" VARCHAR(255) NOT NULL,
                        "_deleted" TIMESTAMP,
                        "_deletedBy" VARCHAR(255)
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

            const tableExists = await doesTableExist(this.client, 'organizations');

            if (tableExists) {
                await this.client.query(`
                    DROP TABLE "organizations";
                `);
            }

            const updateResult = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (updateResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return {
                    success: false, error: new Error(`Error updating migration record for index ${this.index}: Migration record not found.
                    Migration index: ${this.index}`)
                };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error reverting migration ${this.index}: ${error.message}`) };
        }
    }
}
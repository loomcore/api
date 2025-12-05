import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

//TODO: merge these into an atomic transaction
export class CreateOrganizationsTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgName: string, private readonly orgCode: string) {
    }

    index = 2;

    async execute() {
        const _id = randomUUID().toString();
        try {
            await this.client.query(`
            CREATE TABLE "organizations" (
                "_id" VARCHAR(255) PRIMARY KEY,
                "name" VARCHAR(255) NOT NULL,
                "code" VARCHAR(255) NOT NULL,
                "description" TEXT,
                "status" INTEGER NOT NULL,
                "isMetaOrg" BOOLEAN NOT NULL,
                "authToken" TEXT,
                "_created" TIMESTAMP NOT NULL,
                "_createdBy" VARCHAR(255) NOT NULL,
                "_updated" TIMESTAMP NOT NULL,
                "_updatedBy" VARCHAR(255) NOT NULL,
                "_deleted" TIMESTAMP,
                "_deletedBy" VARCHAR(255)
                )
            `);
        } catch (error: any) {
            if (error.code === '42P07' || error.data?.error?.includes('already exists')) {
                console.log(`Organization table already exists`);
            } else {
                return { success: false, error: new Error(`Error creating organization table: ${error.message}`) };
            }
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

        return { success: true, error: null };
    }

    async revert() {
        try {
            const result = await this.client.query(`
                DROP TABLE "organizations";
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error dropping organizations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping organizations table: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (result.rowCount === 0) {
                return {
                    success: false, error: new Error(`Error updating migration record for index ${this.index}: Migration record not found.
                    Migration index: ${this.index}`)
                };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record for index ${this.index}: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
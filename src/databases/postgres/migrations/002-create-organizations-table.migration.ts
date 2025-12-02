import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateOrganizationTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }

    index = 2;
    _id = randomUUID().toString();
    async execute() {
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
            return { success: false, error: new Error(`Error creating organization table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                VALUES ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert() {
        try {
            await this.client.query(`
            DROP TABLE "organizations";
        `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping organizations table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
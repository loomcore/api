import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { randomUUID } from "crypto";


export class CreateTestItemsTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 103;
    async execute() {
        const _id = randomUUID().toString();
        try {
            await this.client.query(`
                CREATE TABLE "testItems" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL,
                    "value" INTEGER,
                    "eventDate" TIMESTAMP,
                    "_created" TIMESTAMP NOT NULL,
                    "_createdBy" VARCHAR(255) NOT NULL,
                    "_updated" TIMESTAMP NOT NULL,
                    "_updatedBy" VARCHAR(255) NOT NULL,
                    "_deleted" TIMESTAMP,
                    "_deletedBy" VARCHAR(255)
                )
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating test items table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                    Insert into "migrations" ("_id", "index", "hasRun", "reverted") values ('${_id}', ${this.index}, TRUE, FALSE);
                `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert() {
        try {
            await this.client.query(`
                DROP TABLE "testItems";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping test items table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
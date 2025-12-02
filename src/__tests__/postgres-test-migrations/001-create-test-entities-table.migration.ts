import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/migration.interface.js";
import { randomUUID } from "crypto";

export class CreateTestEntitiesTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }
    index = 1;
    _id = randomUUID().toString();

    async execute() {
        try {
            await this.client.query(`
                CREATE TABLE "testEntities" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL,
                    "description" TEXT,
                    "isActive" BOOLEAN,
                    "tags" TEXT[],
                    "count" INTEGER,
                    "_created" TIMESTAMP NOT NULL,
                    "_createdBy" VARCHAR(255) NOT NULL,
                    "_updated" TIMESTAMP NOT NULL,
                    "_updatedBy" VARCHAR(255) NOT NULL,
                    "_deleted" TIMESTAMP,
                    "_deletedBy" VARCHAR(255)
                )
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating test entities table: ${error.message}`) };
        }

        if (this.orgId) {
            try {
                await this.client.query(`
                    Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        } else {
            try {
                await this.client.query(`
                    Insert into "migrations" ("_id", "index", "hasRun", "reverted") values ('${this._id}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        }

        return { success: true, error: null };
    }

    async revert() {
        try {
            await this.client.query(`
                DROP TABLE test_entities;
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping test entities table: ${error.message}`) };
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
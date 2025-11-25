import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/migration.interface.js";
import { randomUUID } from "crypto";

export class CreateTestEntitiesTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }
    index = 1;
    _id = randomUUID().toString();

    async execute(): Promise<boolean> {
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
            await this.client.query(`
                Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
            `);
            return true;
        } catch (error: any) {
            console.error('Error creating test entities table:', error);
            return false;
        }
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE test_entities;
            `);
        } catch (error: any) {
            console.error('Error reverting test entities table:', error);
            return false;
        }
        return true;
    }
}
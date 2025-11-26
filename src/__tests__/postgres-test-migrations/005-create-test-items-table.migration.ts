import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { randomUUID } from "crypto";


export class CreateTestItemsTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }

    index = 5;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "testItems" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL,
                    "value" INTEGER,
                    "_created" TIMESTAMP NOT NULL,
                    "_createdBy" VARCHAR(255) NOT NULL,
                    "_updated" TIMESTAMP NOT NULL,
                    "_updatedBy" VARCHAR(255) NOT NULL,
                    "_deleted" TIMESTAMP,
                    "_deletedBy" VARCHAR(255)
                )
            `);
        } catch (error: any) {
            console.error('Error creating test items table:', error);
            return false;
        }
        return true;
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "testItems";
            `);
        } catch (error: any) {
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
            console.error('Error reverting test items table:', error);
            return false;
        }
        return true;
    }
}
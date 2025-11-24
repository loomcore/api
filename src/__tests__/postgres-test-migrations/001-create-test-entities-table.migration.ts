import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/migration.interface.js";

export class CreateTestEntitiesTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }
    id = 1;

    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "testEntities" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "name" VARCHAR(255) NOT NULL,
                    "description" TEXT,
                    "isActive" BOOLEAN NOT NULL,
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

import { randomUUID } from "crypto";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { Client } from "pg";

export class CreateCategoriesTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }

    index = 2;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "categories" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL
                )
            `);
            await this.client.query(`
                Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
            `);
            return true;
        } catch (error: any) {
            console.error('Error creating categories table:', error);
            return false;
        }
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "categories";
            `);
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            console.error('Error reverting categories table:', error);
            return false;
        }
        return true;
    }
}
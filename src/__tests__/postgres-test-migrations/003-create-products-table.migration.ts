import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { randomUUID } from "crypto";

export class CreateProductsTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }

    index = 3;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "products" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL,
                    "description" TEXT,
                    "internalNumber" VARCHAR(255),
                    "categoryId" VARCHAR(255) NOT NULL REFERENCES "categories"("_id"),
                    "_created" TIMESTAMP NOT NULL,
                    "_createdBy" VARCHAR(255) NOT NULL,
                    "_updated" TIMESTAMP NOT NULL,
                    "_updatedBy" VARCHAR(255) NOT NULL,
                    "_deleted" TIMESTAMP,
                    "_deletedBy" VARCHAR(255)
                )
            `);
            if (this.orgId) {
                await this.client.query(`
                    Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
                `);
            } else {
                await this.client.query(`
                    Insert into "migrations" ("_id", "index", "hasRun", "reverted") values ('${this._id}', ${this.index}, TRUE, FALSE);
                `);
            }
            return true;
        } catch (error: any) {
            console.error('Error creating products table:', error);
            return false;
        }
        return true;
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "products";
            `);
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            console.error('Error reverting products table:', error);
            return false;
        }
        return true;
    }
}
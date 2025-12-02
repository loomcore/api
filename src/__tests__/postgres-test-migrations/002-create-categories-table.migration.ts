
import { randomUUID } from "crypto";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { Client } from "pg";

export class CreateCategoriesTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 2;
    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        try {
            await this.client.query(`
                CREATE TABLE "categories" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "name" VARCHAR(255) NOT NULL
                )
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating categories table: ${error.message}`) };
        }

        if (_orgId) {
            try {
                await this.client.query(`
                    Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${_id}', '${_orgId}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        } else {
            try {
                await this.client.query(`
                    Insert into "migrations" ("_id", "index", "hasRun", "reverted") values ('${_id}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        }

        return { success: true, error: null };
    }

    async revert(_orgId?: string) {
        try {
            await this.client.query(`
                DROP TABLE "categories";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping categories table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}' AND "_orgId" = '${_orgId}';
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
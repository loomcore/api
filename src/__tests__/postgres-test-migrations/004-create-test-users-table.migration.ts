import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { randomUUID } from "crypto";

export class CreateTestUsersTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 4;
    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        try {
            await this.client.query(`
                CREATE TABLE "testUsers" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "email" VARCHAR(255) NOT NULL,
                    "password" VARCHAR(255) NOT NULL,
                    "firstName" VARCHAR(255),
                    "lastName" VARCHAR(255),
                    "displayName" VARCHAR(255),
                    "_lastLoggedIn" TIMESTAMP,
                    "_lastPasswordChange" TIMESTAMP,
                    "_created" TIMESTAMP NOT NULL,
                    "_createdBy" VARCHAR(255) NOT NULL,
                    "_updated" TIMESTAMP NOT NULL,
                    "_updatedBy" VARCHAR(255) NOT NULL,
                    "_deleted" TIMESTAMP,
                    "_deletedBy" VARCHAR(255)
                )
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating test users table: ${error.message}`) };
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
                DROP TABLE "testUsers";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping test users table: ${error.message}`) };
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
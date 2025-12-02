import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateUsersTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }

    index = 3;
    _id = randomUUID().toString();
    async execute() {
        try {
            await this.client.query(`
                CREATE TABLE "users" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "email" VARCHAR(255) NOT NULL,
                    "firstName" VARCHAR(255),
                    "lastName" VARCHAR(255),
                    "displayName" VARCHAR(255),
                    "password" VARCHAR(255) NOT NULL,
                    "roles" TEXT[],
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
            return { success: false, error: new Error(`Error creating users table: ${error.message}`) };
        }

        if (this.orgId) {
            try {
                await this.client.query(`
                    INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                    VALUES ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        } else {
            try {
                await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${this._id}', ${this.index}, TRUE, FALSE);
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
                DROP TABLE "users";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping users table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
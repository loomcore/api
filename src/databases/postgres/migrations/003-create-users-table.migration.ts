import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

//TODO: merge these into an atomic transaction
export class CreateUsersTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 3;

    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
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
            if (error.code === '42P07' || error.data?.error?.includes('already exists')) {
                console.log(`Users table already exists`);
            } else {
                return { success: false, error: new Error(`Error creating users table: ${error.message}`) };
            }
        }

        try {
            const result = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert() {
        try {
            const result = await this.client.query(`
                DROP TABLE "users";
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error dropping users table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping users table: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error updating migration record for index ${this.index}: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record for index ${this.index}: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
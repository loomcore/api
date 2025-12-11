import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { doesTableExist } from "../utils/does-table-exist.util.js";

export class CreateUsersTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 3;

    async execute(_orgId?: string) {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'users');

            if (!tableExists) {
                await this.client.query(`
                    CREATE TABLE "users" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "_orgId" VARCHAR(255),
                        "email" VARCHAR(255) NOT NULL,
                        "firstName" VARCHAR(255),
                        "lastName" VARCHAR(255),
                        "displayName" VARCHAR(255),
                        "password" VARCHAR(255) NOT NULL,
                        "_lastLoggedIn" TIMESTAMP,
                        "_lastPasswordChange" TIMESTAMP,
                        "_created" TIMESTAMP NOT NULL,
                        "_createdBy" VARCHAR(255) NOT NULL,
                        "_updated" TIMESTAMP NOT NULL,
                        "_updatedBy" VARCHAR(255) NOT NULL,
                        "_deleted" TIMESTAMP,
                        "_deletedBy" VARCHAR(255),
                        CONSTRAINT "fk_users_organization" FOREIGN KEY ("_orgId") REFERENCES "organizations"("_id") ON DELETE CASCADE,
                        CONSTRAINT "uk_users_email" UNIQUE ("_orgId", "email")
                    )
                `);
            }

            const result = await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${_id}', ${this.index}, TRUE, FALSE);
                `);

            if (result.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error executing migration ${this.index}: ${error.message}`) };
        }
    }

    async revert() {
        try {
            await this.client.query('BEGIN');

            await this.client.query(`
                DROP TABLE "users";
            `);

            const updateResult = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
            if (updateResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error updating migration record for index ${this.index}: No row returned`) };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error reverting migration ${this.index}: ${error.message}`) };
        }
    }
}
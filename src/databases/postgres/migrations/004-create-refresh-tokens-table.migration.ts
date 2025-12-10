import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { doesTableExist } from "../utils/does-table-exist.util.js";

export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 4;
    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'refreshTokens');

            if (!tableExists) {
                await this.client.query(`
                    CREATE TABLE "refreshTokens" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "_orgId" VARCHAR(255),
                        "token" VARCHAR(255) NOT NULL,
                        "deviceId" VARCHAR(255) NOT NULL,
                        "userId" VARCHAR(255) NOT NULL,
                        "expiresOn" BIGINT NOT NULL,
                        "created" TIMESTAMP NOT NULL,
                        "createdBy" VARCHAR(255) NOT NULL
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

            const tableExists = await doesTableExist(this.client, 'refreshTokens');

            if (tableExists) {
                await this.client.query(`
                    DROP TABLE "refreshTokens";
                `);
            }

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
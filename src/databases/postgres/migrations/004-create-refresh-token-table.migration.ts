import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }

    index = 4;
    _id = randomUUID().toString();
    async execute() {
        try {
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
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating refresh token table: ${error.message}`) };
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
                DROP TABLE "refreshTokens";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping refresh token table: ${error.message}`) };
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
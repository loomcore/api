import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

//TODO: merge these into an atomic transaction
export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 4;
    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
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
            if (error.code === '42P07' || error.data?.error?.includes('already exists')) {
                return { success: true, error: null };
            } else {
                return { success: false, error: new Error(`Error creating refresh token table: ${error.message}`) };
            }
        }

        if (_orgId) {
            try {
                await this.client.query(`
                    INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                    VALUES ('${_id}', '${_orgId}', ${this.index}, TRUE, FALSE);
                `);
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        } else {
            try {
                await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${_id}', ${this.index}, TRUE, FALSE);
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
                DROP TABLE "refreshTokens";
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping refresh token table: ${error.message}`) };
        }

        try {
            await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}' AND "_orgId" = '${_orgId}';
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
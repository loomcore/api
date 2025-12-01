import { Client } from "pg";
import { IMigration } from "./index.js";
import { randomUUID } from "crypto";

export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }

    //src/models/refresh-token.model.ts

    index = 4;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
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
            console.error('Error creating refresh token table:', error);
            return false;
        }
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "refresh_tokens";
            `);
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
            return true;
        } catch (error: any) {
            console.error('Error reverting refresh token table:', error);
            return false;
        }
    }
}
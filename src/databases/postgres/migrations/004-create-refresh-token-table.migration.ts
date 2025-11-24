import { Client } from "pg";
import { IMigration } from "./index.js";
import { randomUUID } from "crypto";

export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }

    index = 4;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
            CREATE TABLE "refresh_tokens" (
                "_id" VARCHAR(255) PRIMARY KEY,
                "_orgId" VARCHAR(255) NOT NULL,
                "token" VARCHAR(255) NOT NULL
            )
        `);
            await this.client.query(`
                Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
            `);
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
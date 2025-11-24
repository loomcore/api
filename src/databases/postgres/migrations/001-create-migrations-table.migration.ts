import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from 'crypto';

export class CreateMigrationTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }
    index = 1;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        await this.client.query(`
            CREATE TABLE "migrations" (
                "_id" VARCHAR(255) PRIMARY KEY,
                "_orgId" VARCHAR(255),
                "index" INTEGER NOT NULL,
                "hasRun" BOOLEAN NOT NULL,
                "reverted" BOOLEAN NOT NULL
            )
        `);
        await this.client.query(`
            INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") VALUES ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
        `);
        console.log(`Created migrations table with _id: ${this._id}`);
        return true;
    }

    async revert(): Promise<boolean> {
        await this.client.query(`
            DROP TABLE "migrations";
        `);
        return true;
    }
}
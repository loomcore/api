import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateUsersTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }

    index = 3;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "users" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255) NOT NULL,
                    "email" VARCHAR(255) NOT NULL
                )
            `);
            await this.client.query(`
                Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
            `);
        } catch (error: any) {  
            console.error('Error creating users table:', error);
            return false;
        }
        return true;
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "users";
            `);
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            console.error('Error reverting users table:', error);
            return false;
        }
        return true;
    }
}
import { Client } from "pg";
import { IMigration } from "../../databases/postgres/migrations/index.js";
import { randomUUID } from "crypto";

export class CreateTestUsersTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }

    index = 4;
    _id = randomUUID().toString();
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "testUsers" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "email" VARCHAR(255) NOT NULL,
                    "password" VARCHAR(255) NOT NULL,
                    "firstName" VARCHAR(255),
                    "lastName" VARCHAR(255),
                    "displayName" VARCHAR(255),
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
            console.error('Error creating test users table:', error);
            return false;
        }
        return true;
    }

    async revert(): Promise<boolean> {
        try {
            await this.client.query(`
                DROP TABLE "testUsers";
            `);
        } catch (error: any) {
            await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
            console.error('Error reverting test users table:', error);
            return false;
        }
        return true;
    }
}
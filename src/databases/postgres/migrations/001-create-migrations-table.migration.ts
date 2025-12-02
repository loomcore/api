import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from 'crypto';

export class CreateMigrationTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId?: string) {
    }
    index = 1;
    _id = randomUUID().toString();
    async execute() {
        let alreadyRun = false;
        try {
            await this.client.query(`
                CREATE TABLE "migrations" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "_orgId" VARCHAR(255),
                    "index" INTEGER NOT NULL,
                    "hasRun" BOOLEAN NOT NULL,
                    "reverted" BOOLEAN NOT NULL
                )
            `);
        } catch (error: any) {
            if (error.data.error.includes('already exists')) {
                alreadyRun = true;
            } else {
                return { success: false, error: new Error(`Error creating migrations table: ${error.message}`) };
            }
        }
        if (!alreadyRun) {
            try {
                if (this.orgId) {
                    await this.client.query(`
                        INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                        VALUES ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);`);
                } else {
                    await this.client.query(`
                        INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                        VALUES ('${this._id}', ${this.index}, TRUE, FALSE);
            `);
                }
            } catch (error: any) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
            }
        }
        return { success: true, error: null };
    }

    async revert() {
        try {
            await this.client.query(`
            DROP TABLE "migrations";
        `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error reverting migration ${this.index} from migrations table: ${error.message}`) };
        }
        return { success: true, error: null };
    }
}
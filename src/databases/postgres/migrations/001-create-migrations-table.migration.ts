import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from 'crypto';

//TODO: merge these into an atomic transaction
export class CreateMigrationTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }
    index = 1;
    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
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
            if (error.code !== '42P07' && !error.data?.error?.includes('already exists')) {
                return { success: false, error: new Error(`Error creating migrations table: ${error.message}`) };
            }
        }
        try {
            if (_orgId) {
                const result = await this.client.query(`
                    INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                    VALUES ('${_id}', '${_orgId}', ${this.index}, TRUE, FALSE);`);
                if (result.rowCount === 0) {
                    return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
                }
            } else {
                const result = await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
                if (result.rowCount === 0) {
                    return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
                }
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert(_orgId?: string) {
        try {
            const result = await this.client.query(`
            DROP TABLE "migrations";
        `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error dropping migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error reverting migration ${this.index} from migrations table: ${error.message}`) };
        }
        return { success: true, error: null };
    }
}
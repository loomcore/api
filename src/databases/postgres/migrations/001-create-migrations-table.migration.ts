import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from 'crypto';
import { doesTableExist } from "../utils/does-table-exist.util.js";

export class CreateMigrationTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }
    index = 1;
    async execute() {
        const _id = randomUUID().toString();
        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'migrations');

            if (!tableExists) {
                await this.client.query(`
                    CREATE TABLE "migrations" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "index" INTEGER NOT NULL UNIQUE,
                        "hasRun" BOOLEAN NOT NULL,
                        "reverted" BOOLEAN NOT NULL
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
            await this.client.query(`
            DROP TABLE "migrations";
        `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error reverting migration ${this.index} from migrations table: ${error.message}`) };
        }
        return { success: true, error: null };
    }
}
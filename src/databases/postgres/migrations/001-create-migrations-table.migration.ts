import { Client } from "pg";
import { IMigration } from "./migration.interface.js";

export class CreateMigrationTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }
    
    id = 1;
    async execute(): Promise<boolean> {
        await this.client.query(`
            CREATE TABLE "migrations" (
                _id INTEGER PRIMARY KEY,
                "hasRun" BOOLEAN NOT NULL,
                "reverted" BOOLEAN NOT NULL
            )
        `);
        return true;
    }

    async revert(): Promise<boolean> {
        await this.client.query(`
            DROP TABLE "migrations";
        `);
        return true;
    }
}
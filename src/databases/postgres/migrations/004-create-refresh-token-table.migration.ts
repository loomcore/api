import { Client } from "pg";
import { IMigration } from "./index.js";

export class CreateRefreshTokenTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    id = 1;
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
            CREATE TABLE refresh_tokens (
                id SERIAL PRIMARY KEY,
                token VARCHAR(255) NOT NULL
            )
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
                DROP TABLE refresh_tokens;
            `);
            return true;
        } catch (error: any) {
            console.error('Error reverting refresh token table:', error);
            return false;
        }
    }
}
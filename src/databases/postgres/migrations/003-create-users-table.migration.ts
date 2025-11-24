import { Client } from "pg";
import { IMigration } from "./migration.interface.js";

export class CreateUsersTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    id = 3;
    async execute(): Promise<boolean> {
        try {
            await this.client.query(`
                CREATE TABLE "users" (
                    "_id" VARCHAR(255) PRIMARY KEY,
                    "email" VARCHAR(255) NOT NULL
                )
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
        } catch (error: any) {
            console.error('Error reverting users table:', error);
            return false;
        }
        return true;
    }
}
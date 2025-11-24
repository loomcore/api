import { Client } from "pg";
import { IMigration } from "./migration.interface.js";

export class CreateOrganizationTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }
    
    id = 2;
    async execute(): Promise<boolean> {
        try {
        await this.client.query(`
            CREATE TABLE "organizations" (
                "_id" VARCHAR(255) PRIMARY KEY,
                "name" VARCHAR(255) NOT NULL,
                "code" VARCHAR(255) NOT NULL,
                "description" TEXT,
                "status" INTEGER NOT NULL,
                "isMetaOrg" BOOLEAN NOT NULL,
                "authToken" TEXT,
                "_created" TIMESTAMP NOT NULL,
                "_createdBy" VARCHAR(255) NOT NULL,
                "_updated" TIMESTAMP NOT NULL,
                "_updatedBy" VARCHAR(255) NOT NULL,
                "_deleted" TIMESTAMP,
                "_deletedBy" VARCHAR(255)
                )
            `);

            await this.client.query(`
                Insert into "migrations" ("_id", "hasRun", "reverted") values ('002', TRUE, FALSE);
            `);

            return true;
        } catch (error: any) {
            console.error('Error creating organization table:', error);
            return false;
        }
    }

    async revert(): Promise<boolean> {
        try {   
        await this.client.query(`
            DROP TABLE "organizations";
        `);
        await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '002';
            `);
        } catch (error: any) {
            console.error('Error reverting organization table:', error);
            return false;
        }
        return true;
    }
}
import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateOrganizationTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgId: string) {
    }
    
    index = 2;
    _id = randomUUID().toString();
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
                Insert into "migrations" ("_id", "_orgId", "index", "hasRun", "reverted") values ('${this._id}', '${this.orgId}', ${this.index}, TRUE, FALSE);
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
                Update "migrations" SET "reverted" = TRUE WHERE "_id" = '${this._id}';
            `);
        } catch (error: any) {
            console.error('Error reverting organization table:', error);
            return false;
        }
        return true;
    }
}
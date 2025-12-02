import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

//TODO: merge these into an atomic transaction
export class CreateOrganizationTableMigration implements IMigration {
    constructor(private readonly client: Client, private readonly orgName: string, private readonly orgCode: string) {
    }

    index = 2;

    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        const _orgIdToUse = _orgId || randomUUID().toString();
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
        } catch (error: any) {
            if (error.code === '42P07' || error.data?.error?.includes('already exists')) {
                return { success: true, error: null };
            } else {
                return { success: false, error: new Error(`Error creating organization table: ${error.message}`) };
            }
        }

        try {
            await this.client.query(`
                INSERT INTO "organizations" ("_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy")
                VALUES ('${_orgIdToUse}', '${this.orgName}', '${this.orgCode}', 1, true, NOW(), 'system', NOW(), 'system');
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating meta organization: ${error.message}`) };
        }

        try {
            await this.client.query(`
                INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                VALUES ('${_id}', '${_orgIdToUse}', ${this.index}, TRUE, FALSE);
            `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert(_orgId?: string) {
        try {
            await this.client.query(`
            DROP TABLE "organizations";
        `);
        } catch (error: any) {
            return { success: false, error: new Error(`Error dropping organizations table: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                Update "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}' AND "_orgId" = '${_orgId}';
            `);
            if (result.rowCount === 0) {
                return {
                    success: false, error: new Error(`Error updating migration record: Migration record not found.
                    Migration index: ${this.index}, _orgId: ${_orgId}`)
                };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error updating migration record: ${error.message}`) };
        }

        return { success: true, error: null };
    }
}
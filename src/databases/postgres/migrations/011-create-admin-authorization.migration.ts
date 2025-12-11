import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";

export class CreateAdminAuthorizationMigration implements IMigration {
    constructor(private readonly client: Client, private readonly adminUserId: string, private readonly metaOrgId?: string) {
    }

    index = 11;

    async execute() {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            // 1) Add 'admin' role to the roles table
            const roleId = randomUUID().toString();
            const roleResult = await this.client.query(`
                INSERT INTO "roles" ("_id", "_orgId", "name")
                VALUES ($1, $2, 'admin')
            `, [roleId, this.metaOrgId]);

            if (roleResult.rows.length === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error('Failed to create admin role') };
            }

            // 2) Add mapping of admin role and adminUserId in the userRoles table
            const userRoleId = randomUUID().toString();
            const userRoleResult = await this.client.query(`
                INSERT INTO "user_roles" ("_id", "_orgId", "_userId", "_roleId")
                VALUES ($1, $2, $3, $4)
            `, [userRoleId, this.metaOrgId, this.adminUserId, roleId]);

            if (userRoleResult.rows.length === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error('Failed to create user role') };
            }

            // 3) Add feature with name 'metaOrgAdmin'
            const featureId = randomUUID().toString();
            const featureResult = await this.client.query(`
                INSERT INTO "features" ("_id", "_orgId", "name")
                VALUES ($1, $2, 'admin')
            `, [featureId, this.metaOrgId]);

            if (featureResult.rows.length === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error('Failed to create admin feature') };
            }

            // 4) Add mapping of admin feature to admin role in the authorizations table
            const authorizationId = randomUUID().toString();
            const authorizationResult = await this.client.query(`
                INSERT INTO "authorizations" (
                    "_id", "_orgId", "_roleId", "_featureId", 
                    "_created", "_createdBy", "_updated", "_updatedBy"
                )
                VALUES ($1, $2, $3, $4, NOW(), 'system', NOW(), 'system')
            `, [authorizationId, this.metaOrgId, roleId, featureId]);

            if (authorizationResult.rows.length === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error('Failed to create admin authorization') };
            }

            // Insert migration record
            const migrationResult = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ($1, $2, TRUE, FALSE)
            `, [_id, this.index]);

            if (migrationResult.rowCount === 0) {
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

    async revert(metaOrgId?: string) {
        try {
            await this.client.query('BEGIN');

            // Remove authorization mapping
            await this.client.query(`
                DELETE FROM "authorizations" 
                WHERE "_orgId" = $1 
                AND "_featureId" IN (
                    SELECT "_id" FROM "features" 
                    WHERE "_orgId" = $1 AND "name" = 'admin'
                )
                AND "_roleId" IN (
                    SELECT "_id" FROM "roles" 
                    WHERE "_orgId" = $1 AND "name" = 'admin'
                )
            `, [metaOrgId]);

            // Remove feature
            await this.client.query(`
                DELETE FROM "features" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
            `, [metaOrgId]);

            // Remove user role mapping
            await this.client.query(`
                DELETE FROM "user_roles" 
                WHERE "_orgId" = $1 
                AND "_roleId" IN (
                    SELECT "_id" FROM "roles" 
                    WHERE "_orgId" = $1 AND "name" = 'admin'
                )
            `, [metaOrgId]);

            // Remove role
            await this.client.query(`
                DELETE FROM "roles" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
            `, [metaOrgId]);

            // Update migration record
            const updateResult = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = $1
            `, [this.index]);

            if (updateResult.rowCount === 0) {
                await this.client.query('ROLLBACK');
                return { success: false, error: new Error(`Error updating migration record for index ${this.index}: No row returned`) };
            }

            await this.client.query('COMMIT');
            return { success: true, error: null };
        } catch (error: any) {
            await this.client.query('ROLLBACK');
            return { success: false, error: new Error(`Error reverting migration ${this.index}: ${error.message}`) };
        }
    }
}

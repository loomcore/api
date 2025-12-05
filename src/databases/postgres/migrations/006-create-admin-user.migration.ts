import { Client } from "pg";
import { IMigration, PostgresDatabase } from "../index.js";
import { randomUUID } from "crypto";
import { EmptyUserContext, getSystemUserContext, initializeSystemUserContext } from "@loomcore/common/models";
import { AuthService } from "../../../services/auth.service.js";
import { OrganizationService } from "../../../services/index.js";

export class CreateAdminUserMigration implements IMigration {
    constructor(private readonly client: Client, private readonly adminEmail: string, private readonly adminPassword: string) {
    }

    index = 6;

    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        try {
            const database = new PostgresDatabase(this.client);
            const authService = new AuthService(database);
            const adminUser = await authService.createUser(getSystemUserContext(), {
                _id: _id,
                _orgId: _orgId,
                email: this.adminEmail,
                password: this.adminPassword,
                firstName: 'Admin',
                lastName: 'User',
                displayName: 'Admin User',
                roles: ['admin'],
            });
        } catch (error: any) {
            return { success: false, error: new Error(`Error creating admin user: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert(): Promise<{ success: boolean, error: Error | null }> {
        throw new Error('Not implemented');
    }
}
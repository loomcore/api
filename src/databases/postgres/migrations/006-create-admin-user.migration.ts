import { Client } from "pg";
import { IMigration, PostgresDatabase } from "../index.js";
import { randomUUID } from "crypto";
import { UserService } from "../../../services/user.service.js";
import { getSystemUserContext, initializeSystemUserContext } from "@loomcore/common/models";
import { AuthService } from "../../../services/auth.service.js";

export class CreateAdminUserMigration implements IMigration {
    constructor(private readonly client: Client, private readonly adminEmail: string, private readonly adminPassword: string) {
    }

    index = 6;

    async execute(_orgId?: string) {
        const _id = randomUUID().toString();
        try {
            const database = new PostgresDatabase(this.client);
            const authService = new AuthService(database);
            initializeSystemUserContext(this.adminEmail, _orgId);
            const systemUserContext = getSystemUserContext();
            const adminUser = await authService.createUser(systemUserContext, {
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
                INSERT INTO "migrations" ("_id", "_orgId", "index", "hasRun", "reverted")
                VALUES ('${_id}', '${_orgId}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert(_orgId?: string): Promise<{ success: boolean, error: Error | null }> {
        throw new Error('Not implemented');
    }
}
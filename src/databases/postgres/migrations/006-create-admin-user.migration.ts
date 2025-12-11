import { Client } from "pg";
import { IMigration, PostgresDatabase } from "../index.js";
import { randomUUID } from "crypto";
import { getSystemUserContext, IUser } from "@loomcore/common/models";
import { AuthService } from "../../../services/auth.service.js";

export class CreateAdminUserMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 6;

    async execute(adminEmail?: string, adminPassword?: string): Promise<{ success: boolean, adminUserId: string | undefined, error: Error | null }> {
        const _id = randomUUID().toString();
        const systemUserContext = getSystemUserContext();
        let createdUser: IUser | null;
        try {
            const database = new PostgresDatabase(this.client);
            const authService = new AuthService(database);
            createdUser = await authService.createUser(systemUserContext, {
                _id: _id,
                _orgId: systemUserContext._orgId,
                email: adminEmail,
                password: adminPassword,
                firstName: 'Admin',
                lastName: 'User',
                displayName: 'Admin User',
            });
        } catch (error: any) {
            return {
                success: false, adminUserId: undefined, error: new Error(`Error creating admin user: ${error.message}`)
            };
        }

        try {
            const result = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                return { success: false, adminUserId: undefined, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            return { success: false, adminUserId: undefined, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, adminUserId: createdUser?._id, error: null };
    }

    async revert(): Promise<{ success: boolean, error: Error | null }> {
        throw new Error('Not implemented');
    }
}
import { Client } from "pg";
import { IMigration, PostgresDatabase } from "../index.js";
import { randomUUID } from "crypto";
import { getSystemUserContext } from "@loomcore/common/models";
import { AuthService } from "../../../services/auth.service.js";
import { config } from "../../../config/index.js";

export class CreateAdminUserMigration implements IMigration {
    constructor(private readonly client: Client) {
        const database = new PostgresDatabase(this.client);
        this.authService = new AuthService(database);
    }

    private authService: AuthService;
    index = 6;

    async execute() {
        const _id = randomUUID().toString();

        const systemUserContext = getSystemUserContext();
        try {
            await this.authService.createUser(systemUserContext, {
                _id: _id,
                // this should be the meta org id if multi-tenant, otherwise undefined
                _orgId: systemUserContext.organization?._id,
                email: config.adminUser?.email,
                password: config.adminUser?.password,
                firstName: 'Admin',
                lastName: 'User',
                displayName: 'Admin User',
            });
        } catch (error: any) {
            console.error(`Error creating admin user: ${error.message}`);
            return { success: false, error: new Error(`Error creating admin user: ${error.message}`) };
        }

        try {
            const result = await this.client.query(`
                INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                VALUES ('${_id}', ${this.index}, TRUE, FALSE);
            `);
            if (result.rowCount === 0) {
                console.error(`Error inserting migration ${this.index} to migrations table: No row returned`);
                return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: No row returned`) };
            }
        } catch (error: any) {
            console.error(`Error inserting migration ${this.index} to migrations table: ${error.message}`);
            return { success: false, error: new Error(`Error inserting migration ${this.index} to migrations table: ${error.message}`) };
        }

        return { success: true, error: null };
    }

    async revert(): Promise<{ success: boolean, error: Error | null }> {
        throw new Error('Not implemented');
    }
}
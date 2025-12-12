import { Client } from "pg";
import _ from "lodash";
import { IDatabaseBuilder } from "./database-builder.interface.js";
import { IMigration } from "./migration.interface.js";
import { CreateMigrationTableMigration } from "./001-create-migrations-table.migration.js";
import { CreateUsersTableMigration } from "./003-create-users-table.migration.js";
import { CreateAdminUserMigration } from "./006-create-admin-user.migration.js";
import { CreateUserRolesTableMigration } from "./008-create-user-roles-table.migration.js";
import { CreateAuthorizationsTableMigration } from "./010-create-authorizations-table.migration.js";
import { CreateFeaturesTableMigration } from "./009-create-features-table.migration.js";
import { CreateRoleTableMigration } from "./007-create-roles-table.migration.js";
import { CreateRefreshTokenTableMigration } from "./004-create-refresh-tokens-table.migration.js";
import { CreateAdminAuthorizationMigration } from "./011-create-admin-authorization.migration.js";
import { CreateMetaOrgMigration } from "./005-create-meta-org.migration.js";
import { CreateOrganizationsTableMigration } from "./002-create-organizations-table.migration.js";
import { doesTableExist } from "../utils/index.js";

export class DatabaseBuilder implements IDatabaseBuilder {
    private client: Client;

    private migrationsToRun: IMigration[] = [];

    constructor(client: Client) {
        this.client = client;
    }

    withAuth(): IDatabaseBuilder {
        this.migrationsToRun.push(new CreateMigrationTableMigration(this.client));
        this.migrationsToRun.push(new CreateUsersTableMigration(this.client));
        this.migrationsToRun.push(new CreateRefreshTokenTableMigration(this.client));
        this.migrationsToRun.push(new CreateAdminUserMigration(this.client));
        this.migrationsToRun.push(new CreateRoleTableMigration(this.client));
        this.migrationsToRun.push(new CreateUserRolesTableMigration(this.client));
        this.migrationsToRun.push(new CreateFeaturesTableMigration(this.client));
        this.migrationsToRun.push(new CreateAuthorizationsTableMigration(this.client));
        this.migrationsToRun.push(new CreateAdminAuthorizationMigration(this.client));
        return this;
    }

    withMultitenant(): IDatabaseBuilder {
        this.migrationsToRun.push(new CreateMigrationTableMigration(this.client));
        this.migrationsToRun.push(new CreateOrganizationsTableMigration(this.client));
        this.migrationsToRun.push(new CreateMetaOrgMigration(this.client));
        return this;
    }

    withMigrations(migrations: IMigration[]): IDatabaseBuilder {
        this.migrationsToRun.push(...migrations);
        return this;
    }

    async build(): Promise<{ success: boolean, error: Error | null }> {

        let runMigrations: number[] = [];

        if (await doesTableExist(this.client, 'migrations')) {
            const migrations = await this.client.query(`
                SELECT "_id", "index"
                FROM migrations
                WHERE "hasRun" = TRUE AND "reverted" = FALSE
            `);
            runMigrations = migrations.rows.map((row) => {
                return row.index as number;
            });
        }

        const orderedMigrations = _.uniqBy(
            this.migrationsToRun
                .filter((migration) => !runMigrations.includes(migration.index))
                .sort((a, b) => a.index - b.index),
            'index'
        );
        for (const migration of orderedMigrations) {
            const result = await migration.execute();
            if (!result.success) {
                throw result.error;
            }
        }
        return { success: true, error: null };
    }
}
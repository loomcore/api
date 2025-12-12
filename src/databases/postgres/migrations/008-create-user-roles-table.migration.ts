import { Client } from "pg";
import { IMigration } from "./migration.interface.js";
import { randomUUID } from "crypto";
import { doesTableExist } from "../utils/does-table-exist.util.js";
import { config } from "../../../config/index.js";

export class CreateUserRolesTableMigration implements IMigration {
    constructor(private readonly client: Client) {
    }

    index = 8;

    async execute() {
        const _id = randomUUID().toString();

        try {
            await this.client.query('BEGIN');

            const tableExists = await doesTableExist(this.client, 'user_roles');

            if (!tableExists) {

                const fkConstraint = config.app.isMultiTenant
                    ? '\n                        CONSTRAINT "fk_user_roles_organization" FOREIGN KEY ("_orgId") REFERENCES "organizations"("_id") ON DELETE CASCADE,'
                    : '';

                await this.client.query(`
                    CREATE TABLE "user_roles" (
                        "_id" VARCHAR(255) PRIMARY KEY,
                        "_orgId" VARCHAR(255),
                        "userId" VARCHAR(255) NOT NULL,
                        "roleId" VARCHAR(255) NOT NULL,
                        "_created" TIMESTAMP NOT NULL,
                        "_createdBy" VARCHAR(255) NOT NULL,
                        "_updated" TIMESTAMP NOT NULL,
                        "_updatedBy" VARCHAR(255) NOT NULL,
                        "_deleted" TIMESTAMP,
                        "_deletedBy" VARCHAR(255),
                        ${fkConstraint}
                        CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE,
                        CONSTRAINT "fk_user_roles_role" FOREIGN KEY ("roleId") REFERENCES "roles"("_id") ON DELETE CASCADE,
                        CONSTRAINT "uk_user_roles" UNIQUE ("_orgId", "userId", "roleId")
                    )
                `);
            }

            const result = await this.client.query(`
                    INSERT INTO "migrations" ("_id", "index", "hasRun", "reverted")
                    VALUES ('${_id}', ${this.index}, TRUE, FALSE);
                `);

            if (result.rowCount === 0) {
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

    async revert() {
        try {
            await this.client.query('BEGIN');

            await this.client.query(`
                DROP TABLE "user_roles";
            `);

            const updateResult = await this.client.query(`
                UPDATE "migrations" SET "reverted" = TRUE WHERE "index" = '${this.index}';
            `);
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

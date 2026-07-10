import {
	EmptyUserContext,
	getSystemUserContext,
	type IOrganization,
	initializeSystemUserContext,
	isSystemUserContextInitialized,
} from "@loomcore/common/models";
import type { Pool } from "pg";
import type { IInitialDbMigrationConfig } from "../../../models/initial-database-config.interface.js";
import { OrganizationService } from "../../../services/index.js";
import { passwordUtils } from "../../../utils/index.js";
import { PostgresDatabase } from "../postgres.database.js";

// Define the interface Umzug expects for code-based migrations
export interface SyntheticMigration {
	name: string;
	up: (context: { context: Pool }) => Promise<void>;
	down: (context: { context: Pool }) => Promise<void>;
}

export const getPostgresInitialSchema = (
	dbConfig: IInitialDbMigrationConfig,
): SyntheticMigration[] => {
	const migrations: SyntheticMigration[] = [];

	const isMultiTenant = dbConfig.app.isMultiTenant;
	if (isMultiTenant && !dbConfig.multiTenant) {
		throw new Error(
			"Multi-tenant configuration is enabled but multi-tenant configuration is not provided",
		);
	}

	const isAuthEnabled = dbConfig.app.isAuthEnabled;

	const dbName = dbConfig.database.name.replace(/"/g, '""');

	// 1. SYSTEM-LEVEL DATABASE SETTINGS (extend this migration for more ALTER DATABASE ... settings)
	migrations.push({
		name: "00000000000001_system-configurations",
		up: async ({ context: pool }) => {
			// pg-mem (used by migration tests) does not implement ALTER DATABASE
			if (dbConfig.env === "test") {
				return;
			}
			await pool.query(
				`ALTER DATABASE "${dbName}" SET statement_timeout = '60s'`,
			);
		},
		down: async ({ context: pool }) => {
			if (dbConfig.env === "test") {
				return;
			}
			await pool.query(`ALTER DATABASE "${dbName}" RESET statement_timeout`);
		},
	});

	// 2. ORGANIZATIONS (Conditionally Added - only for multi-tenant)
	if (isMultiTenant) {
		migrations.push({
			name: "00000000000002_schema-organizations",
			up: async ({ context: pool }) => {
				await pool.query(`
          CREATE TABLE IF NOT EXISTS "organizations" (
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            "name" VARCHAR(255) NOT NULL UNIQUE,
            "code" VARCHAR(255) UNIQUE,
            "description" TEXT,
            "status" INTEGER NOT NULL,
            "is_meta_org" BOOLEAN NOT NULL,
            "auth_token" TEXT,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ,
            "_updatedBy" INTEGER,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER
          )
        `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "organizations"');
			},
		});

		migrations.push({
			name: "00000000000002_schema-organization-domains",
			up: async ({ context: pool }) => {
				await pool.query(`
				CREATE TABLE IF NOT EXISTS "organization_domains" (
					"_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
					"organization_id" INTEGER NOT NULL,
					"domain" VARCHAR(255) NOT NULL UNIQUE,
					"_created" TIMESTAMPTZ NOT NULL,
					"_createdBy" INTEGER NOT NULL,
					"_updated" TIMESTAMPTZ,
					"_updatedBy" INTEGER,
					"_deleted" TIMESTAMPTZ,
					"_deletedBy" INTEGER,
					CONSTRAINT "fk_organization_domains_organization"
					FOREIGN KEY("organization_id") REFERENCES "organizations"("_id") ON DELETE CASCADE
				)
				`);
				await pool.query(
					`CREATE INDEX IF NOT EXISTS "idx_organization_domains_organization_id" ON "organization_domains"("organization_id")`,
				);
			},
			down: async ({ context: pool }) => {
				await pool.query(
					`DROP INDEX IF EXISTS "idx_organization_domains_organization_id"`,
				);
				await pool.query('DROP TABLE IF EXISTS "organization_domains"');
			},
		});
	}

	// 3. USERS
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000003_schema-users",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_users_email" UNIQUE ("_orgId", "email")'
					: 'CONSTRAINT "uk_users_email" UNIQUE ("email")';
				await pool.query(`
        CREATE TABLE IF NOT EXISTS "users"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          	"external_id" VARCHAR(255) UNIQUE,
            "email" VARCHAR(255) NOT NULL,
            "display_name" VARCHAR(255),
            "password" VARCHAR(255) NOT NULL,
            "_lastLoggedIn" TIMESTAMPTZ,
            "_lastPasswordChange" TIMESTAMPTZ,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ,
            "_updatedBy" INTEGER,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER,
            ${uniqueConstraint}
          )`);
				await pool.query(
					`CREATE INDEX IF NOT EXISTS "idx_users_external_id" ON "users"("external_id")`,
				);
				await pool.query(
					`CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users"("email")`,
				);
			},
			down: async ({ context: pool }) => {
				await pool.query(`DROP INDEX IF EXISTS "idx_users_external_id"`);
				await pool.query(`DROP INDEX IF EXISTS "idx_users_email"`);
				await pool.query(`DROP TABLE IF EXISTS "users"`);
			},
		});

	// 4. REFRESH TOKENS
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000004_schema-refresh-tokens",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "refresh_tokens"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "token" VARCHAR(255) NOT NULL,
            "device_id" VARCHAR(255) NOT NULL,
            "user_id" INTEGER NOT NULL,
            "expires_on" BIGINT NOT NULL,
            "created" TIMESTAMPTZ NOT NULL,
            "created_by" INTEGER NOT NULL,
            CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY("user_id") REFERENCES "users"("_id") ON DELETE CASCADE
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "refresh_tokens"');
			},
		});

	// 5. PASSWORD RESET TOKENS
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000005_schema-password-reset-tokens",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_passwordResetTokens_email" UNIQUE ("_orgId", "email")'
					: 'CONSTRAINT "uk_passwordResetTokens_email" UNIQUE ("email")';

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "email" VARCHAR(255) NOT NULL,
            "token" VARCHAR(255) NOT NULL,
            "expires_on" BIGINT NOT NULL,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ,
            "_updatedBy" INTEGER,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER,
            ${uniqueConstraint}
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "password_reset_tokens"');
			},
		});

	// 6. ROLES
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000006_schema-roles",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_roles_name" UNIQUE ("_orgId", "name")'
					: 'CONSTRAINT "uk_roles_name" UNIQUE ("name")';

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "roles"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL,
            "description" TEXT,
            ${uniqueConstraint}
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "roles"');
			},
		});

	// 7. USER ROLES
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000007_schema-user-roles",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_user_roles" UNIQUE ("_orgId", "user_id", "role_id")'
					: 'CONSTRAINT "uk_user_roles" UNIQUE ("user_id", "role_id")';

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "user_roles"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "user_id" INTEGER NOT NULL,
            "role_id" INTEGER NOT NULL,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ,
            "_updatedBy" INTEGER,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER,
            CONSTRAINT "fk_user_roles_user" FOREIGN KEY("user_id") REFERENCES "users"("_id") ON DELETE CASCADE,
            CONSTRAINT "fk_user_roles_role" FOREIGN KEY("role_id") REFERENCES "roles"("_id") ON DELETE CASCADE,
            ${uniqueConstraint}
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "user_roles"');
			},
		});

	// 8. FEATURES
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000008_schema-features",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_features" UNIQUE ("_orgId", "name")'
					: 'CONSTRAINT "uk_features" UNIQUE ("name")';

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "features"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "name" VARCHAR(255) NOT NULL,
            "description" TEXT,
            ${uniqueConstraint}
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "features"');
			},
		});

	// 9. AUTHORIZATIONS
	if (isAuthEnabled)
		migrations.push({
			name: "00000000000009_schema-authorizations",
			up: async ({ context: pool }) => {
				const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER NOT NULL,' : "";
				const uniqueConstraint = isMultiTenant
					? 'CONSTRAINT "uk_authorizations" UNIQUE ("_orgId", "role_id", "feature_id")'
					: 'CONSTRAINT "uk_authorizations" UNIQUE ("role_id", "feature_id")';

				await pool.query(`
        CREATE TABLE IF NOT EXISTS "authorizations"(
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ${orgColumnDef}
          "role_id" INTEGER NOT NULL,
            "feature_id" INTEGER NOT NULL,
            "start_date" TIMESTAMPTZ,
            "end_date" TIMESTAMPTZ,
            "config" JSONB,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ,
            "_updatedBy" INTEGER,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER,
            CONSTRAINT "fk_authorizations_role" FOREIGN KEY("role_id") REFERENCES "roles"("_id") ON DELETE CASCADE,
            CONSTRAINT "fk_authorizations_feature" FOREIGN KEY("feature_id") REFERENCES "features"("_id") ON DELETE CASCADE,
            ${uniqueConstraint}
          )
          `);
			},
			down: async ({ context: pool }) => {
				await pool.query('DROP TABLE IF EXISTS "authorizations"');
			},
		});

	// 10. META ORG (only for multi-tenant)
	if (isMultiTenant) {
		migrations.push({
			name: "00000000000010_data-meta-org",
			up: async ({ context: pool }) => {
				const result = await pool.query(
					`
					INSERT INTO "organizations"("name", "code", "status", "is_meta_org", "_created", "_createdBy")
					VALUES($1, $2, 1, true, NOW(), 0)
					RETURNING "_id", "name", "code", "status", "is_meta_org", "_created", "_createdBy"
					`,
					[
						dbConfig.multiTenant?.metaOrgName,
						dbConfig.multiTenant?.metaOrgCode,
					],
				);

				if (result.rowCount === 0) {
					throw new Error("Failed to create meta organization");
				}

				const metaOrg = result.rows[0] as IOrganization;

				const metaOrgDomains = dbConfig.multiTenant?.metaOrgDomains ?? [];
				for (const domain of metaOrgDomains) {
					await pool.query(
						`
						INSERT INTO "organization_domains"("organization_id", "domain", "_created", "_createdBy")
						VALUES($1, $2, NOW(), 0)
						`,
						[metaOrg._id, domain],
					);
				}

				// Initialize system user context with the meta org
				initializeSystemUserContext(
					dbConfig.email?.systemEmailAddress || "system@example.com",
					metaOrg,
				);
			},
			down: async ({ context: pool }) => {
				await pool.query(
					`DELETE FROM "organizations" WHERE "is_meta_org" = TRUE`,
				);
			},
		});
	}

	// 11. ADMIN USER
	if (isAuthEnabled && dbConfig.adminUser) {
		migrations.push({
			name: "00000000000011_data-admin-user",
			up: async ({ context: pool }) => {
				// SystemUserContext MUST be initialized before this migration runs
				// For multi-tenant: meta-org migration should have initialized it
				// For non-multi-tenant: should be initialized before migrations run (bug if not)
				if (!isSystemUserContextInitialized()) {
					const errorMessage = isMultiTenant
						? "SystemUserContext has not been initialized. The meta-org migration (00000000000010_data-meta-org) should have run before this migration. " +
							"Please ensure metaOrgName and metaOrgCode are provided in your dbConfig."
						: "BUG: SystemUserContext has not been initialized. For non-multi-tenant setups, SystemUserContext should be initialized before migrations run.";

					console.error("❌ Migration Error:", errorMessage);
					throw new Error(errorMessage);
				}

				const systemUserContext = getSystemUserContext();
				const orgId = isMultiTenant
					? systemUserContext.organization?._id
					: undefined;
				const hashedPassword = await passwordUtils.hashPassword(
					dbConfig.adminUser.password,
				);
				const email = dbConfig.adminUser.email.toLowerCase();

				const client = await pool.connect();
				try {
					if (isMultiTenant) {
						await client.query(
							`INSERT INTO "users"("_orgId", "email", "display_name", "password", "_created", "_createdBy")
        				VALUES($1, $2, 'Admin User', $3, NOW(), 0)`,
							[orgId, email, hashedPassword],
						);
					} else {
						await client.query(
							`INSERT INTO "users"("email", "display_name", "password", "_created", "_createdBy")
        				VALUES($1, 'Admin User', $2, NOW(), 0)`,
							[email, hashedPassword],
						);
					}
				} finally {
					client.release();
				}
			},
			down: async ({ context: pool }) => {
				if (!dbConfig.adminUser?.email) return;

				await pool.query(`DELETE FROM "users" WHERE "email" = $1`, [
					dbConfig.adminUser.email.toLowerCase(),
				]);
			},
		});
	}

	// 12. ADMIN AUTHORIZATION
	if (isAuthEnabled && dbConfig.adminUser) {
		migrations.push({
			name: "00000000000012_data-admin-authorizations",
			up: async ({ context: pool }) => {
				const client = await pool.connect();
				try {
					const database = new PostgresDatabase(client);
					const organizationService = new OrganizationService(database);

					// Get metaOrg if multi-tenant, otherwise use null/undefined for _orgId
					const metaOrg = isMultiTenant
						? await organizationService.getMetaOrg(EmptyUserContext)
						: undefined;
					if (isMultiTenant && !metaOrg) {
						throw new Error(
							"Meta organization not found. Ensure meta-org migration ran successfully.",
						);
					}

					const email = dbConfig.adminUser.email.toLowerCase();
					const userResult = await client.query(
						`SELECT "_id" FROM "users" WHERE "email" = $1`,
						[email],
					);
					const adminUserRow = userResult.rows[0];
					if (!adminUserRow) {
						throw new Error(
							"Admin user not found. Ensure admin-user migration ran successfully.",
						);
					}
					const adminUserId = adminUserRow._id;

					await client.query("BEGIN");

					try {
						// 1) Add 'admin' role
						const roleResult = isMultiTenant
							? await client.query(
									`
                  INSERT INTO "roles"("_orgId", "name")
        VALUES($1, 'admin')
                  RETURNING "_id"
          `,
									[metaOrg!._id],
								)
							: await client.query(`
                  INSERT INTO "roles"("name")
        VALUES('admin')
                  RETURNING "_id"
          `);

						if (roleResult.rowCount === 0) {
							throw new Error("Failed to create admin role");
						}
						const roleId = roleResult.rows[0]._id;

						// 2) Add user role mapping
						const userRoleResult = isMultiTenant
							? await client.query(
									`
                  INSERT INTO "user_roles"("_orgId", "user_id", "role_id", "_created", "_createdBy")
        VALUES($1, $2, $3, NOW(), 0)
          `,
									[metaOrg!._id, adminUserId, roleId],
								)
							: await client.query(
									`
                  INSERT INTO "user_roles"("user_id", "role_id", "_created", "_createdBy")
        VALUES($1, $2, NOW(), 0)
          `,
									[adminUserId, roleId],
								);

						if (userRoleResult.rowCount === 0) {
							throw new Error("Failed to create user role");
						}

						// 3) Add admin feature
						const featureResult = isMultiTenant
							? await client.query(
									`
                  INSERT INTO "features"("_orgId", "name")
        VALUES($1, 'admin')
                  RETURNING "_id"
          `,
									[metaOrg!._id],
								)
							: await client.query(`
                  INSERT INTO "features"("name")
        VALUES('admin')
                  RETURNING "_id"
          `);

						if (featureResult.rowCount === 0) {
							throw new Error("Failed to create admin feature");
						}
						const featureId = featureResult.rows[0]._id;

						// 4) Add authorization
						const authorizationResult = isMultiTenant
							? await client.query(
									`
                  INSERT INTO "authorizations"(
            "_orgId", "role_id", "feature_id",
            "_created", "_createdBy"
          )
        VALUES($1, $2, $3, NOW(), 0)
          `,
									[metaOrg!._id, roleId, featureId],
								)
							: await client.query(
									`
                  INSERT INTO "authorizations"(
            "role_id", "feature_id",
            "_created", "_createdBy"
          )
        VALUES($1, $2, NOW(), 0)
          `,
									[roleId, featureId],
								);

						if (authorizationResult.rowCount === 0) {
							throw new Error("Failed to create admin authorization");
						}

						await client.query("COMMIT");
					} catch (error) {
						await client.query("ROLLBACK");
						throw error;
					}
				} finally {
					client.release();
				}
			},
			down: async ({ context: pool }) => {
				const client = await pool.connect();
				try {
					const database = new PostgresDatabase(client);
					const organizationService = new OrganizationService(database);
					const metaOrg = isMultiTenant
						? await organizationService.getMetaOrg(EmptyUserContext)
						: undefined;

					if (isMultiTenant && !metaOrg) return;

					await client.query("BEGIN");

					try {
						if (isMultiTenant) {
							// Remove authorization
							await client.query(
								`
                DELETE FROM "authorizations" 
                WHERE "_orgId" = $1 
                AND "feature_id" IN(
            SELECT "_id" FROM "features" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
          )
                AND "role_id" IN(
            SELECT "_id" FROM "roles" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
          )
          `,
								[metaOrg!._id],
							);

							// Remove feature
							await client.query(
								`
                DELETE FROM "features" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
          `,
								[metaOrg!._id],
							);

							// Remove user role mapping
							await client.query(
								`
                DELETE FROM "user_roles" 
                WHERE "_orgId" = $1 
                AND "role_id" IN(
            SELECT "_id" FROM "roles" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
          )
          `,
								[metaOrg!._id],
							);

							// Remove role
							await client.query(
								`
                DELETE FROM "roles" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
          `,
								[metaOrg!._id],
							);
						} else {
							// Remove authorization
							await client.query(`
                DELETE FROM "authorizations" 
                WHERE "feature_id" IN(
            SELECT "_id" FROM "features" 
                  WHERE "name" = 'admin'
          )
                AND "role_id" IN(
            SELECT "_id" FROM "roles" 
                  WHERE "name" = 'admin'
          )
          `);

							// Remove feature
							await client.query(`
                DELETE FROM "features" 
                WHERE "name" = 'admin'
          `);

							// Remove user role mapping
							await client.query(`
                DELETE FROM "user_roles" 
                WHERE "role_id" IN(
            SELECT "_id" FROM "roles" 
                  WHERE "name" = 'admin'
          )
          `);

							// Remove role
							await client.query(`
                DELETE FROM "roles" 
                WHERE "name" = 'admin'
          `);
						}

						await client.query("COMMIT");
					} catch (error) {
						await client.query("ROLLBACK");
						throw error;
					}
				} finally {
					client.release();
				}
			},
		});
	}

	return migrations;
};

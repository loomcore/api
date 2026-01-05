import { Pool, Client } from 'pg';
import { IBaseApiConfig } from '../../../models/base-api-config.interface.js';
import { initializeSystemUserContext, IOrganization, EmptyUserContext, getSystemUserContext, isSystemUserContextInitialized } from '@loomcore/common/models';
import { PostgresDatabase } from '../postgres.database.js';
import { AuthService, OrganizationService } from '../../../services/index.js';
import { IEmailClient } from '../../../models/email-client.interface.js';

// Define the interface Umzug expects for code-based migrations
export interface SyntheticMigration {
  name: string;
  up: (context: { context: Pool }) => Promise<void>;
  down: (context: { context: Pool }) => Promise<void>;
}

export const getPostgresInitialSchema = (config: IBaseApiConfig, emailClient?: IEmailClient): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];

  const isMultiTenant = config.app.isMultiTenant;
  if (isMultiTenant && !config.multiTenant) {
    throw new Error('Multi-tenant configuration is enabled but multi-tenant configuration is not provided');
  }

  const isAuthEnabled = config.app.isAuthEnabled;
  if (isAuthEnabled && !config.auth) {
    throw new Error('Auth enabled without auth configuration');
  }

  if (isAuthEnabled && (!emailClient || !config.email)) {
    throw new Error('Auth enabled without email client or email configuration');
  }

  // 1. ORGANIZATIONS (Conditionally Added - only for multi-tenant)
  if (isMultiTenant) {
    migrations.push({
      name: '00000000000001_schema-organizations',
      up: async ({ context: pool }) => {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "organizations" (
            "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            "name" VARCHAR(255) NOT NULL UNIQUE,
            "code" VARCHAR(255) NOT NULL UNIQUE,
            "description" TEXT,
            "status" INTEGER NOT NULL,
            "isMetaOrg" BOOLEAN NOT NULL,
            "authToken" TEXT,
            "_created" TIMESTAMPTZ NOT NULL,
            "_createdBy" INTEGER NOT NULL,
            "_updated" TIMESTAMPTZ NOT NULL,
            "_updatedBy" INTEGER NOT NULL,
            "_deleted" TIMESTAMPTZ,
            "_deletedBy" INTEGER
          )
        `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "organizations"');
      }
    });
  }

  // 2. USERS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000002_schema-users',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_users_email" UNIQUE ("_orgId", "email")'
          : 'CONSTRAINT "uk_users_email" UNIQUE ("email")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "users" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "email" VARCHAR(255) NOT NULL,
          "firstName" VARCHAR(255),
          "lastName" VARCHAR(255),
          "displayName" VARCHAR(255),
          "password" VARCHAR(255) NOT NULL,
          "_lastLoggedIn" TIMESTAMPTZ,
          "_lastPasswordChange" TIMESTAMPTZ,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          ${uniqueConstraint}
        )
      `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "users"');
      }
    });

  // 3. REFRESH TOKENS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000003_schema-refresh-tokens',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "refresh_tokens" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "token" VARCHAR(255) NOT NULL,
          "deviceId" VARCHAR(255) NOT NULL,
          "userId" INTEGER NOT NULL,
          "expiresOn" BIGINT NOT NULL,
          "created" TIMESTAMPTZ NOT NULL,
          "createdBy" INTEGER NOT NULL,
          CONSTRAINT "fk_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE
        )
      `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "refresh_tokens"');
      }
    });

  // 4. PASSWORD RESET TOKENS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000004_schema-password-reset-tokens',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_passwordResetTokens_email" UNIQUE ("_orgId", "email")'
          : 'CONSTRAINT "uk_passwordResetTokens_email" UNIQUE ("email")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "email" VARCHAR(255) NOT NULL,
          "token" VARCHAR(255) NOT NULL,
          "expiresOn" BIGINT NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          ${uniqueConstraint}
        )
      `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "passwordResetTokens"');
      }
    });

  // 5. ROLES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000005_schema-roles',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_roles_name" UNIQUE ("_orgId", "name")'
          : 'CONSTRAINT "uk_roles_name" UNIQUE ("name")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "roles" (
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
      }
    });

  // 6. USER ROLES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000006_schema-user-roles',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_user_roles" UNIQUE ("_orgId", "userId", "roleId")'
          : 'CONSTRAINT "uk_user_roles" UNIQUE ("userId", "roleId")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "user_roles" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "userId" INTEGER NOT NULL,
          "roleId" INTEGER NOT NULL,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE,
          CONSTRAINT "fk_user_roles_role" FOREIGN KEY ("roleId") REFERENCES "roles"("_id") ON DELETE CASCADE,
          ${uniqueConstraint}
        )
      `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "user_roles"');
      }
    });

  // 7. FEATURES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000007_schema-features',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_features" UNIQUE ("_orgId", "name")'
          : 'CONSTRAINT "uk_features" UNIQUE ("name")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "features" (
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
      }
    });

  // 8. AUTHORIZATIONS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000008_schema-authorizations',
      up: async ({ context: pool }) => {
        const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';
        const uniqueConstraint = isMultiTenant
          ? 'CONSTRAINT "uk_authorizations" UNIQUE ("_orgId", "roleId", "featureId")'
          : 'CONSTRAINT "uk_authorizations" UNIQUE ("roleId", "featureId")';

        await pool.query(`
        CREATE TABLE IF NOT EXISTS "authorizations" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "roleId" INTEGER NOT NULL,
          "featureId" INTEGER NOT NULL,
          "startDate" TIMESTAMPTZ,
          "endDate" TIMESTAMPTZ,
          "config" JSONB,
          "_created" TIMESTAMPTZ NOT NULL,
          "_createdBy" INTEGER NOT NULL,
          "_updated" TIMESTAMPTZ NOT NULL,
          "_updatedBy" INTEGER NOT NULL,
          "_deleted" TIMESTAMPTZ,
          "_deletedBy" INTEGER,
          CONSTRAINT "fk_authorizations_role" FOREIGN KEY ("roleId") REFERENCES "roles"("_id") ON DELETE CASCADE,
          CONSTRAINT "fk_authorizations_feature" FOREIGN KEY ("featureId") REFERENCES "features"("_id") ON DELETE CASCADE,
          ${uniqueConstraint}
        )
      `);
      },
      down: async ({ context: pool }) => {
        await pool.query('DROP TABLE IF EXISTS "authorizations"');
      }
    });

  // 9. META ORG (only for multi-tenant)
  if (isMultiTenant) {
    migrations.push({
      name: '00000000000009_data-meta-org',
      up: async ({ context: pool }) => {
        const result = await pool.query(`
          INSERT INTO "organizations" ("name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy")
          VALUES ($1, $2, 1, true, NOW(), 0, NOW(), 0)
          RETURNING "_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy"
        `, [config.multiTenant?.metaOrgName, config.multiTenant?.metaOrgCode]);

        if (result.rowCount === 0) {
          throw new Error('Failed to create meta organization');
        }

        // Initialize system user context with the meta org
        initializeSystemUserContext(
          config.email?.systemEmailAddress || 'system@example.com',
          result.rows[0] as IOrganization
        );
      },
      down: async ({ context: pool }) => {
        await pool.query(`DELETE FROM "organizations" WHERE "isMetaOrg" = TRUE`);
      }
    });
  }

  // 10. ADMIN USER
  if (isAuthEnabled) {
    migrations.push({
      name: '00000000000010_data-admin-user',
      up: async ({ context: pool }) => {
        // Get a client from the pool to use with PostgresDatabase
        const client = await pool.connect();
        try {
          const database = new PostgresDatabase(client as unknown as Client);
          const authService = new AuthService(database, emailClient!);

          // SystemUserContext MUST be initialized before this migration runs
          // For multi-tenant: meta-org migration should have initialized it
          // For non-multi-tenant: should be initialized before migrations run (bug if not)
          if (!isSystemUserContextInitialized()) {
            const errorMessage = isMultiTenant
              ? 'SystemUserContext has not been initialized. The meta-org migration (00000000000009_data-meta-org) should have run before this migration. ' +
              'This migration only runs if config.app.metaOrgName and config.app.metaOrgCode are provided. ' +
              'Please ensure both values are set in your config.'
              : 'BUG: SystemUserContext has not been initialized. For non-multi-tenant setups, SystemUserContext should be initialized before migrations run.';

            console.error('❌ Migration Error:', errorMessage);
            throw new Error(errorMessage);
          }

          // Get the system user context (now guaranteed to be initialized)
          const systemUserContext = getSystemUserContext();

          // Only include _orgId if multi-tenant (non-multi-tenant users table doesn't have _orgId column)
          const userData: any = {
            email: config.auth?.adminUser?.email,
            password: config.auth?.adminUser?.password,
            firstName: 'Admin',
            lastName: 'User',
            displayName: 'Admin User',
          };
          if (isMultiTenant && systemUserContext.organization?._id) {
            userData._orgId = systemUserContext.organization._id;
          }
          await authService.createUser(systemUserContext, userData);
        } finally {
          client.release();
        }
      },
      down: async ({ context: pool }) => {
        if (!config.auth?.adminUser?.email) return;

        const result = await pool.query(
          `DELETE FROM "users" WHERE "email" = $1`,
          [config.auth?.adminUser?.email]
        );
      }
    });
  }

  // 11. ADMIN AUTHORIZATION (only if auth config is provided)
  if (config.auth) {
    migrations.push({
      name: '00000000000011_data-admin-authorizations',
      up: async ({ context: pool }) => {
        // Get a client from the pool to use with services
        const client = await pool.connect();
        try {
          const database = new PostgresDatabase(client as unknown as Client);
          const organizationService = new OrganizationService(database);
          const authService = new AuthService(database, emailClient!);

          // Get metaOrg if multi-tenant, otherwise use null/undefined for _orgId
          const metaOrg = isMultiTenant ? await organizationService.getMetaOrg(EmptyUserContext) : undefined;
          if (isMultiTenant && !metaOrg) {
            throw new Error('Meta organization not found. Ensure meta-org migration ran successfully.');
          }

          const adminUser = await authService.getUserByEmail(config.auth!.adminUser.email);
          if (!adminUser) {
            throw new Error('Admin user not found. Ensure admin-user migration ran successfully.');
          }

          await client.query('BEGIN');

          try {
            // 1) Add 'admin' role
            const roleResult = isMultiTenant
              ? await client.query(`
                  INSERT INTO "roles" ("_orgId", "name")
                  VALUES ($1, 'admin')
                  RETURNING "_id"
                `, [metaOrg!._id])
              : await client.query(`
                  INSERT INTO "roles" ("name")
                  VALUES ('admin')
                  RETURNING "_id"
                `);

            if (roleResult.rowCount === 0) {
              throw new Error('Failed to create admin role');
            }
            const roleId = roleResult.rows[0]._id;

            // 2) Add user role mapping
            const userRoleResult = isMultiTenant
              ? await client.query(`
                  INSERT INTO "user_roles" ("_orgId", "userId", "roleId", "_created", "_createdBy", "_updated", "_updatedBy")
                  VALUES ($1, $2, $3, NOW(), 0, NOW(), 0)
                `, [metaOrg!._id, adminUser._id, roleId])
              : await client.query(`
                  INSERT INTO "user_roles" ("userId", "roleId", "_created", "_createdBy", "_updated", "_updatedBy")
                  VALUES ($1, $2, NOW(), 0, NOW(), 0)
                `, [adminUser._id, roleId]);

            if (userRoleResult.rowCount === 0) {
              throw new Error('Failed to create user role');
            }

            // 3) Add admin feature
            const featureResult = isMultiTenant
              ? await client.query(`
                  INSERT INTO "features" ("_orgId", "name")
                  VALUES ($1, 'admin')
                  RETURNING "_id"
                `, [metaOrg!._id])
              : await client.query(`
                  INSERT INTO "features" ("name")
                  VALUES ('admin')
                  RETURNING "_id"
                `);

            if (featureResult.rowCount === 0) {
              throw new Error('Failed to create admin feature');
            }
            const featureId = featureResult.rows[0]._id;

            // 4) Add authorization
            const authorizationResult = isMultiTenant
              ? await client.query(`
                  INSERT INTO "authorizations" (
                    "_orgId", "roleId", "featureId", 
                    "_created", "_createdBy", "_updated", "_updatedBy"
                  )
                  VALUES ($1, $2, $3, NOW(), 0, NOW(), 0)
                `, [metaOrg!._id, roleId, featureId])
              : await client.query(`
                  INSERT INTO "authorizations" (
                    "roleId", "featureId", 
                    "_created", "_createdBy", "_updated", "_updatedBy"
                  )
                  VALUES ($1, $2, NOW(), 0, NOW(), 0)
                `, [roleId, featureId]);

            if (authorizationResult.rowCount === 0) {
              throw new Error('Failed to create admin authorization');
            }

            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        } finally {
          client.release();
        }
      },
      down: async ({ context: pool }) => {
        const client = await pool.connect();
        try {
          const database = new PostgresDatabase(client as unknown as Client);
          const organizationService = new OrganizationService(database);
          const metaOrg = isMultiTenant ? await organizationService.getMetaOrg(EmptyUserContext) : undefined;

          if (isMultiTenant && !metaOrg) return;

          await client.query('BEGIN');

          try {
            if (isMultiTenant) {
              // Remove authorization
              await client.query(`
                DELETE FROM "authorizations" 
                WHERE "_orgId" = $1 
                AND "featureId" IN (
                  SELECT "_id" FROM "features" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
                )
                AND "roleId" IN (
                  SELECT "_id" FROM "roles" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
                )
              `, [metaOrg!._id]);

              // Remove feature
              await client.query(`
                DELETE FROM "features" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
              `, [metaOrg!._id]);

              // Remove user role mapping
              await client.query(`
                DELETE FROM "user_roles" 
                WHERE "_orgId" = $1 
                AND "roleId" IN (
                  SELECT "_id" FROM "roles" 
                  WHERE "_orgId" = $1 AND "name" = 'admin'
                )
              `, [metaOrg!._id]);

              // Remove role
              await client.query(`
                DELETE FROM "roles" 
                WHERE "_orgId" = $1 AND "name" = 'admin'
              `, [metaOrg!._id]);
            } else {
              // Remove authorization
              await client.query(`
                DELETE FROM "authorizations" 
                WHERE "featureId" IN (
                  SELECT "_id" FROM "features" 
                  WHERE "name" = 'admin'
                )
                AND "roleId" IN (
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
                WHERE "roleId" IN (
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

            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          }
        } finally {
          client.release();
        }
      }
    });
  }

  return migrations;
};
import { Pool, Client } from 'pg';
import { IBaseApiConfig } from '../../../models/base-api-config.interface.js';
import { initializeSystemUserContext, IOrganization, EmptyUserContext, getSystemUserContext } from '@loomcore/common/models';
import { PostgresDatabase } from '../postgres.database.js';
import { AuthService, OrganizationService } from '../../../services/index.js';

// Define the interface Umzug expects for code-based migrations
export interface SyntheticMigration {
  name: string;
  up: (context: { context: Pool }) => Promise<void>;
  down: (context: { context: Pool }) => Promise<void>;
}

export const getPostgresInitialSchema = (config: IBaseApiConfig): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];
  const isMultiTenant = config.app.isMultiTenant === true;

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
  migrations.push({
    name: '00000000000003_schema-refresh-tokens',
    up: async ({ context: pool }) => {
      const orgColumnDef = isMultiTenant ? '"_orgId" INTEGER,' : '';

      await pool.query(`
        CREATE TABLE IF NOT EXISTS "refreshTokens" (
          "_id" INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ${orgColumnDef}
          "token" VARCHAR(255) NOT NULL,
          "deviceId" VARCHAR(255) NOT NULL,
          "userId" INTEGER NOT NULL,
          "expiresOn" BIGINT NOT NULL,
          "created" TIMESTAMPTZ NOT NULL,
          "createdBy" INTEGER NOT NULL,
          CONSTRAINT "fk_refreshTokens_user" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE
        )
      `);
    },
    down: async ({ context: pool }) => {
      await pool.query('DROP TABLE IF EXISTS "refreshTokens"');
    }
  });

  // 4. ROLES
  migrations.push({
    name: '00000000000004_schema-roles',
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

  // 5. USER ROLES
  migrations.push({
    name: '00000000000005_schema-user-roles',
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

  // 6. FEATURES
  migrations.push({
    name: '00000000000006_schema-features',
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

  // 7. AUTHORIZATIONS
  migrations.push({
    name: '00000000000007_schema-authorizations',
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

  // 8. META ORG (only for multi-tenant)
  if (isMultiTenant && config.app.metaOrgName && config.app.metaOrgCode) {
    migrations.push({
      name: '00000000000008_data-meta-org',
      up: async ({ context: pool }) => {
        const result = await pool.query(`
          INSERT INTO "organizations" ("name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy")
          VALUES ($1, $2, 1, true, NOW(), 0, NOW(), 0)
          RETURNING "_id", "name", "code", "status", "isMetaOrg", "_created", "_createdBy", "_updated", "_updatedBy"
        `, [config.app.metaOrgName, config.app.metaOrgCode]);

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

  // 9. ADMIN USER (only if adminUser config is provided)
  if (config.auth?.adminUser?.email && config.auth?.adminUser?.password) {
    migrations.push({
      name: '00000000000009_data-admin-user',
      up: async ({ context: pool }) => {
        if (!config.auth?.adminUser?.email || !config.auth?.adminUser?.password) {
          throw new Error('Admin user email and password must be provided in config');
        }

        // Get a client from the pool to use with PostgresDatabase
        const client = await pool.connect();
        try {
          const database = new PostgresDatabase(client as unknown as Client);
          const authService = new AuthService(database);

          // Get system user context
          // For multi-tenant, this should be initialized by meta-org migration
          // For non-multi-tenant, it should be initialized before migrations run
          let systemUserContext = getSystemUserContext();
          if (!systemUserContext) {
            throw new Error('SystemUserContext has not been initialized. For non-multi-tenant setups, initialize it before running migrations.');
          }

          // For multi-tenant, ensure the systemUserContext has an organization
          // If meta-org migration ran, it should have set it, but let's verify
          if (isMultiTenant) {
            if (!systemUserContext.organization?._id) {
              // Try to get the meta org and re-initialize the context
              const organizationService = new OrganizationService(database);
              const metaOrg = await organizationService.getMetaOrg(EmptyUserContext);
              if (metaOrg) {
                initializeSystemUserContext(
                  config.email?.systemEmailAddress || 'system@example.com',
                  metaOrg
                );
                systemUserContext = getSystemUserContext();
              }
              // If meta-org still doesn't exist, this is a configuration error
              // Admin user creation is mandatory and requires a meta-org in multi-tenant mode
              if (!systemUserContext?.organization?._id) {
                throw new Error('Cannot create admin user: Multi-tenant mode is enabled but meta-org does not exist. Ensure metaOrgName and metaOrgCode are provided in config so the meta-org migration runs before the admin-user migration.');
              }
            }
          }

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

  // 10. ADMIN AUTHORIZATION (only if adminUser config is provided)
  if (config.auth?.adminUser?.email) {
    migrations.push({
      name: '00000000000010_data-admin-authorizations',
      up: async ({ context: pool }) => {
        if (!config.auth?.adminUser?.email) {
          throw new Error('Admin user email not found in config');
        }

        // Get a client from the pool to use with services
        const client = await pool.connect();
        try {
          const database = new PostgresDatabase(client as unknown as Client);
          const organizationService = new OrganizationService(database);
          const authService = new AuthService(database);

          // Get metaOrg if multi-tenant, otherwise use null/undefined for _orgId
          const metaOrg = isMultiTenant ? await organizationService.getMetaOrg(EmptyUserContext) : undefined;
          if (isMultiTenant && !metaOrg) {
            throw new Error('Meta organization not found. Ensure meta-org migration ran successfully.');
          }

          const adminUser = await authService.getUserByEmail(config.auth?.adminUser?.email);
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
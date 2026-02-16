import { Db } from 'mongodb';
import { initializeSystemUserContext, IOrganization, EmptyUserContext, getSystemUserContext, isSystemUserContextInitialized } from '@loomcore/common/models';
import { MongoDBDatabase } from '../mongo-db.database.js';
import { AuthService, GenericApiService, OrganizationService } from '../../../services/index.js';
import { IResetApiConfig } from '../../../models/reset-api-config.interface.js';

export interface ISyntheticMigration {
  name: string;
  up: (context: { context: Db }) => Promise<void>;
  down: (context: { context: Db }) => Promise<void>;
}

export const getMongoInitialSchema = (config: IBaseApiConfig, resetConfig?: IResetApiConfig): ISyntheticMigration[] => {
  const migrations: ISyntheticMigration[] = [];

  const isMultiTenant = dbConfig.app.isMultiTenant;
  if (isMultiTenant && !dbConfig.multiTenant) {
    throw new Error('Multi-tenant configuration is enabled but multi-tenant configuration is not provided');
  }

  const isAuthEnabled = dbConfig.app.isAuthEnabled;

  // 1. ORGANIZATIONS (Conditionally Added - only for multi-tenant)
  if (isMultiTenant)
    migrations.push({
      name: '00000000000001_schema-organizations',
      up: async ({ context: db }) => {
        await db.createCollection('organizations');
        await db.collection('organizations').createIndex({ name: 1 }, { unique: true });
        await db.collection('organizations').createIndex({ code: 1 }, { unique: true });
        await db.collection('organizations').createIndex({ isMetaOrg: 1 });
      },
      down: async ({ context: db }) => {
        await db.collection('organizations').drop();
      }
    });

  // 2. PERSONS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000002_schema-persons',
      up: async ({ context: db }) => {
        await db.createCollection('persons');
        if (isMultiTenant) {
          await db.collection('persons').createIndex({ _orgId: 1 });
          await db.collection('persons').createIndex({ _orgId: 1, externalId: 1 }, { unique: true, sparse: true });
        } else {
          await db.collection('persons').createIndex({ externalId: 1 }, { unique: true, sparse: true });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('persons').drop();
      }
    });

  // 3. USERS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000003_schema-users',
      up: async ({ context: db }) => {
        await db.createCollection('users');

        // Create indexes
        if (dbConfig.app.isMultiTenant) {
          // Multi-tenant: unique email per organization
          await db.collection('users').createIndex({ _orgId: 1, email: 1 }, { unique: true });
          await db.collection('users').createIndex({ _orgId: 1 });
        } else {
          // Single-tenant: unique email globally
          await db.collection('users').createIndex({ email: 1 }, { unique: true });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('users').drop();
      }
    });

  // 4. REFRESH TOKENS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000004_schema-refresh-tokens',
      up: async ({ context: db }) => {
        await db.createCollection('refresh_tokens');
        await db.collection('refresh_tokens').createIndex({ token: 1 }, { unique: true });
        await db.collection('refresh_tokens').createIndex({ userId: 1 });
        await db.collection('refresh_tokens').createIndex({ deviceId: 1 });
        if (isMultiTenant) {
          await db.collection('refresh_tokens').createIndex({ _orgId: 1 });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('refresh_tokens').drop();
      }
    });

  // 5. PASSWORD RESET TOKENS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000005_schema-password-reset-tokens',
      up: async ({ context: db }) => {
        await db.createCollection('password_reset_tokens');
        if (isMultiTenant) {
          await db.collection('password_reset_tokens').createIndex({ _orgId: 1, email: 1 }, { unique: true });
          await db.collection('password_reset_tokens').createIndex({ _orgId: 1 });
        } else {
          await db.collection('password_reset_tokens').createIndex({ email: 1 }, { unique: true });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('password_reset_tokens').drop();
      }
    });

  // 6. ROLES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000006_schema-roles',
      up: async ({ context: db }) => {
        await db.createCollection('roles');
        if (isMultiTenant) {
          await db.collection('roles').createIndex({ _orgId: 1, name: 1 }, { unique: true });
          await db.collection('roles').createIndex({ _orgId: 1 });
        } else {
          await db.collection('roles').createIndex({ name: 1 }, { unique: true });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('roles').drop();
      }
    });

  // 7. USER ROLES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000007_schema-user-roles',
      up: async ({ context: db }) => {
        await db.createCollection('user_roles');
        if (isMultiTenant) {
          await db.collection('user_roles').createIndex({ _orgId: 1, userId: 1, roleId: 1 }, { unique: true });
          await db.collection('user_roles').createIndex({ _orgId: 1 });
        } else {
          await db.collection('user_roles').createIndex({ userId: 1, roleId: 1 }, { unique: true });
        }
        await db.collection('user_roles').createIndex({ userId: 1 });
        await db.collection('user_roles').createIndex({ roleId: 1 });
      },
      down: async ({ context: db }) => {
        await db.collection('user_roles').drop();
      }
    });

  // 8. FEATURES
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000008_schema-features',
      up: async ({ context: db }) => {
        await db.createCollection('features');
        if (isMultiTenant) {
          await db.collection('features').createIndex({ _orgId: 1, name: 1 }, { unique: true });
          await db.collection('features').createIndex({ _orgId: 1 });
        } else {
          await db.collection('features').createIndex({ name: 1 }, { unique: true });
        }
      },
      down: async ({ context: db }) => {
        await db.collection('features').drop();
      }
    });

  // 9. AUTHORIZATIONS
  if (isAuthEnabled)
    migrations.push({
      name: '00000000000009_schema-authorizations',
      up: async ({ context: db }) => {
        await db.createCollection('authorizations');
        if (isMultiTenant) {
          await db.collection('authorizations').createIndex({ _orgId: 1, roleId: 1, featureId: 1 }, { unique: true });
          await db.collection('authorizations').createIndex({ _orgId: 1 });
        } else {
          await db.collection('authorizations').createIndex({ roleId: 1, featureId: 1 }, { unique: true });
        }
        await db.collection('authorizations').createIndex({ roleId: 1 });
        await db.collection('authorizations').createIndex({ featureId: 1 });
      },
      down: async ({ context: db }) => {
        await db.collection('authorizations').drop();
      }
    });

  // 10. META ORG (only for multi-tenant)
  if (isMultiTenant) {
    migrations.push({
      name: '00000000000010_data-meta-org',
      up: async ({ context: db }) => {
        const metaOrgDoc = {
          name: dbConfig.multiTenant!.metaOrgName,
          code: dbConfig.multiTenant!.metaOrgCode,
          description: undefined,
          status: 1,
          isMetaOrg: true,
          authToken: undefined,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system',
          _deleted: undefined,
          _deletedBy: undefined
        };

        const result = await db.collection('organizations').insertOne(metaOrgDoc as any);
        const metaOrg = { ...metaOrgDoc, _id: result.insertedId } as unknown as IOrganization;

        // Initialize system user context with the meta org
        initializeSystemUserContext(
          dbConfig.email?.systemEmailAddress || 'system@example.com',
          metaOrg
        );
      },
      down: async ({ context: db }) => {
        await db.collection('organizations').deleteMany({ isMetaOrg: true });
      }
    });
  }

  // 9. ADMIN USER (only if adminUser config is provided)
  if (isAuthEnabled && resetConfig) {
    migrations.push({
      name: '00000000000011_data-admin-user',
      up: async ({ context: db }) => {
        // SystemUserContext MUST be initialized before this migration runs
        // For multi-tenant: meta-org migration should have initialized it
        // For non-multi-tenant: should be initialized before migrations run (bug if not)
        if (!isSystemUserContextInitialized()) {
          const errorMessage = isMultiTenant
            ? 'SystemUserContext has not been initialized. The meta-org migration (00000000000010_data-meta-org) should have run before this migration. ' +
            'Please ensure metaOrgName and metaOrgCode are provided in your dbConfig.'
            : 'BUG: SystemUserContext has not been initialized. For non-multi-tenant setups, SystemUserContext should be initialized before migrations run.';

          console.error('❌ Migration Error:', errorMessage);
          throw new Error(errorMessage);
        }

        const systemUserContext = getSystemUserContext();
        const orgDoc = isMultiTenant && systemUserContext.organization?._id ? { _orgId: systemUserContext.organization._id } : {};
        const hashedPassword = await passwordUtils.hashPassword(dbConfig.adminUser.password);
        const email = dbConfig.adminUser.email.toLowerCase();

        const personResult = await db.collection('persons').insertOne({
          ...orgDoc,
          externalId: 'admin-user-person-external-id',
          firstName: 'Admin',
          lastName: 'User',
          isAgent: false,
          isClient: false,
          isEmployee: false,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system' as any
        } as any);

        await db.collection('users').insertOne({
          ...orgDoc,
          externalId: 'admin-user-external-id',
          email: resetConfig.adminUser.email,
          password: resetConfig.adminUser.password,
          displayName: 'Admin User',
          personId: personResult.insertedId,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system' as any
        } as any);
      },
      down: async ({ context: db }) => {
        if (!resetConfig?.adminUser?.email) return;
        await db.collection('users').deleteOne({ email: resetConfig.adminUser.email });
      }
    });
  }

  // 10. ADMIN AUTHORIZATION (only if adminUser config is provided and multi-tenant)
  if (resetConfig?.adminUser?.email && isMultiTenant) {
    migrations.push({
      name: '00000000000012_data-admin-authorizations',
      up: async ({ context: db }) => {
        const database = new MongoDBDatabase(db);
        const organizationService = new OrganizationService(database);

        // Get metaOrg if multi-tenant, otherwise use null/undefined for _orgId
        const metaOrg = isMultiTenant ? await organizationService.getMetaOrg(EmptyUserContext) : undefined;
        if (isMultiTenant && !metaOrg) {
          throw new Error('Meta organization not found. Ensure meta-org migration ran successfully.');
        }

        const adminUser = await authService.getUserByEmail(resetConfig.adminUser.email);
        if (!adminUser) {
          throw new Error('Admin user not found. Ensure admin-user migration ran successfully.');
        }

        // Build org-scoped document base (only for multi-tenant)
        const orgDoc = isMultiTenant && metaOrg ? { _orgId: metaOrg._id } : {};

        // 1) Add 'admin' role
        const roleResult = await db.collection('roles').insertOne({
          ...orgDoc,
          name: 'admin'
        } as any);

        // 2) Add user role mapping
        await db.collection('user_roles').insertOne({
          ...orgDoc,
          userId: adminUser._id,
          roleId: roleResult.insertedId,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system',
          _deleted: undefined,
          _deletedBy: undefined
        } as any);

        // 3) Add admin feature
        const featureResult = await db.collection('features').insertOne({
          ...orgDoc,
          name: 'admin'
        } as any);

        // 4) Add authorization
        await db.collection('authorizations').insertOne({
          ...orgDoc,
          roleId: roleResult.insertedId,
          featureId: featureResult.insertedId,
          startDate: undefined,
          endDate: undefined,
          config: undefined,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system',
          _deleted: undefined,
          _deletedBy: undefined
        } as any);
      },
      down: async ({ context: db }) => {
        const database = new MongoDBDatabase(db);
        const organizationService = new OrganizationService(database);
        const metaOrg = isMultiTenant ? await organizationService.getMetaOrg(EmptyUserContext) : undefined;

        if (isMultiTenant && !metaOrg) return;

        // Build query filter (use _orgId only for multi-tenant)
        const orgFilter = isMultiTenant && metaOrg ? { _orgId: metaOrg._id } : {};

        // Find admin role and feature
        const adminRole = await db.collection('roles').findOne({ ...orgFilter, name: 'admin' });
        const adminFeature = await db.collection('features').findOne({ ...orgFilter, name: 'admin' });

        if (adminRole && adminFeature) {
          // Remove authorization
          await db.collection('authorizations').deleteMany({
            ...orgFilter,
            roleId: adminRole._id,
            featureId: adminFeature._id
          });
        }

        // Remove feature
        await db.collection('features').deleteMany({ ...orgFilter, name: 'admin' });

        // Remove user role mapping
        if (adminRole) {
          await db.collection('user_roles').deleteMany({
            ...orgFilter,
            roleId: adminRole._id
          });
        }

        // Remove role
        await db.collection('roles').deleteMany({ ...orgFilter, name: 'admin' });
      }
    });
  }

  return migrations;
};
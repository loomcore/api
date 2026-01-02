import { Db } from 'mongodb';
import { IBaseApiConfig } from '../../../models/base-api-config.interface.js';
import { randomUUID } from 'crypto';
import { initializeSystemUserContext, IOrganization, EmptyUserContext, getSystemUserContext, isSystemUserContextInitialized } from '@loomcore/common/models';
import { MongoDBDatabase } from '../mongo-db.database.js';
import { AuthService, OrganizationService } from '../../../services/index.js';

export interface SyntheticMigration {
  name: string;
  up: (context: { context: Db }) => Promise<void>;
  down: (context: { context: Db }) => Promise<void>;
}

export const getMongoInitialSchema = (config: IBaseApiConfig): SyntheticMigration[] => {
  const migrations: SyntheticMigration[] = [];
  const isMultiTenant = config.app.isMultiTenant === true;

  // Diagnostic: Log config values that determine which migrations are added
  console.log('📋 Migration Config Diagnostic:');
  console.log('  isMultiTenant:', isMultiTenant);
  console.log('  config.app.metaOrgName:', config.app.metaOrgName ?? '(undefined)');
  console.log('  config.app.metaOrgCode:', config.app.metaOrgCode ?? '(undefined)');
  console.log('  config.auth?.adminUser?.email:', config.auth?.adminUser?.email ?? '(undefined)');
  console.log('  config.auth?.adminUser?.password:', config.auth?.adminUser?.password ? '(set)' : '(undefined)');
  console.log('  Will add meta-org migration:', isMultiTenant && !!config.app.metaOrgName && !!config.app.metaOrgCode);
  console.log('  Will add admin-user migration:', !!config.auth?.adminUser?.email && !!config.auth?.adminUser?.password);

  // 1. ORGANIZATIONS (Conditionally Added - only for multi-tenant)
  if (isMultiTenant) {
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
  }

  // 2. USERS
  migrations.push({
    name: '00000000000002_schema-users',
    up: async ({ context: db }) => {
      await db.createCollection('users');

      // Create indexes
      if (isMultiTenant) {
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

  // 3. REFRESH TOKENS
  migrations.push({
    name: '00000000000003_schema-refresh-tokens',
    up: async ({ context: db }) => {
      await db.createCollection('refreshTokens');
      await db.collection('refreshTokens').createIndex({ token: 1 }, { unique: true });
      await db.collection('refreshTokens').createIndex({ userId: 1 });
      await db.collection('refreshTokens').createIndex({ deviceId: 1 });
      if (isMultiTenant) {
        await db.collection('refreshTokens').createIndex({ _orgId: 1 });
      }
    },
    down: async ({ context: db }) => {
      await db.collection('refreshTokens').drop();
    }
  });

  // 4. ROLES
  migrations.push({
    name: '00000000000004_schema-roles',
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

  // 5. USER ROLES
  migrations.push({
    name: '00000000000005_schema-user-roles',
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

  // 6. FEATURES
  migrations.push({
    name: '00000000000006_schema-features',
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

  // 7. AUTHORIZATIONS
  migrations.push({
    name: '00000000000007_schema-authorizations',
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

  // 8. META ORG (only for multi-tenant)
  if (isMultiTenant && config.app.metaOrgName && config.app.metaOrgCode) {
    migrations.push({
      name: '00000000000008_data-meta-org',
      up: async ({ context: db }) => {
        const _id = randomUUID().toString();
        const metaOrg = {
          _id,
          name: config.app.metaOrgName!,
          code: config.app.metaOrgCode!,
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

        await db.collection('organizations').insertOne(metaOrg as any);

        // Initialize system user context with the meta org
        initializeSystemUserContext(
          config.email?.systemEmailAddress || 'system@example.com',
          metaOrg as IOrganization
        );
      },
      down: async ({ context: db }) => {
        await db.collection('organizations').deleteMany({ isMetaOrg: true });
      }
    });
  }

  // 9. ADMIN USER (only if adminUser config is provided)
  if (config.auth && config.auth.adminUser) {
    migrations.push({
      name: '00000000000009_data-admin-user',
      up: async ({ context: db }) => {
        if (!config.auth?.adminUser?.email || !config.auth?.adminUser?.password) {
          throw new Error('Admin user email and password must be provided in config');
        }

        const database = new MongoDBDatabase(db);
        const authService = new AuthService(database);

        // For multi-tenant, SystemUserContext MUST be initialized by meta-org migration
        // If it's not initialized, the meta-org migration didn't run (bug: missing config.app.metaOrgName or config.app.metaOrgCode)
        if (isMultiTenant && !isSystemUserContextInitialized()) {
          throw new Error(
            'SystemUserContext has not been initialized. The meta-org migration (00000000000008_data-meta-org) should have run before this migration. ' +
            'This migration only runs if config.app.metaOrgName and config.app.metaOrgCode are provided. ' +
            'Please ensure both values are set in your config.'
          );
        }

        // For non-multi-tenant, initialize with undefined org if not already initialized
        if (!isMultiTenant && !isSystemUserContextInitialized()) {
          initializeSystemUserContext(
            config.email?.systemEmailAddress || 'system@example.com',
            undefined
          );
        }

        // Get the system user context (now guaranteed to be initialized)
        const systemUserContext = getSystemUserContext();

        const _id = randomUUID().toString();
        await authService.createUser(systemUserContext, {
          _id: _id,
          _orgId: systemUserContext.organization?._id,
          email: config.auth?.adminUser?.email,
          password: config.auth?.adminUser?.password,
          firstName: 'Admin',
          lastName: 'User',
          displayName: 'Admin User',
        });
      },
      down: async ({ context: db }) => {
        if (!config.auth?.adminUser?.email) return;
        await db.collection('users').deleteOne({ email: config.auth?.adminUser?.email });
      }
    });
  }

  // 10. ADMIN AUTHORIZATION (only if adminUser config is provided and multi-tenant)
  if (config.auth?.adminUser?.email && isMultiTenant) {
    migrations.push({
      name: '00000000000010_data-admin-authorizations',
      up: async ({ context: db }) => {
        if (!config.auth?.adminUser?.email) {
          throw new Error('Admin user email not found in config');
        }

        const database = new MongoDBDatabase(db);
        const organizationService = new OrganizationService(database);
        const authService = new AuthService(database);

        const metaOrg = await organizationService.getMetaOrg(EmptyUserContext);
        if (!metaOrg) {
          throw new Error('Meta organization not found. Ensure meta-org migration ran successfully.');
        }

        const adminUser = await authService.getUserByEmail(config.auth?.adminUser?.email);
        if (!adminUser) {
          throw new Error('Admin user not found. Ensure admin-user migration ran successfully.');
        }

        // 1) Add 'admin' role
        const roleId = randomUUID().toString();
        await db.collection('roles').insertOne({
          _id: roleId,
          _orgId: metaOrg._id,
          name: 'admin'
        } as any);

        // 2) Add user role mapping
        const userRoleId = randomUUID().toString();
        await db.collection('user_roles').insertOne({
          _id: userRoleId,
          _orgId: metaOrg._id,
          userId: adminUser._id,
          roleId: roleId,
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system',
          _deleted: undefined,
          _deletedBy: undefined
        } as any);

        // 3) Add admin feature
        const featureId = randomUUID().toString();
        await db.collection('features').insertOne({
          _id: featureId,
          _orgId: metaOrg._id,
          name: 'admin'
        } as any);

        // 4) Add authorization
        const authorizationId = randomUUID().toString();
        await db.collection('authorizations').insertOne({
          _id: authorizationId,
          _orgId: metaOrg._id,
          roleId: roleId,
          featureId: featureId,
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
        const metaOrg = await organizationService.getMetaOrg(EmptyUserContext);

        if (!metaOrg) return;

        // Find admin role and feature
        const adminRole = await db.collection('roles').findOne({ _orgId: metaOrg._id, name: 'admin' });
        const adminFeature = await db.collection('features').findOne({ _orgId: metaOrg._id, name: 'admin' });

        if (adminRole && adminFeature) {
          // Remove authorization
          await db.collection('authorizations').deleteMany({
            _orgId: metaOrg._id,
            roleId: adminRole._id,
            featureId: adminFeature._id
          });
        }

        // Remove feature
        await db.collection('features').deleteMany({ _orgId: metaOrg._id, name: 'admin' });

        // Remove user role mapping
        if (adminRole) {
          await db.collection('user_roles').deleteMany({
            _orgId: metaOrg._id,
            roleId: adminRole._id
          });
        }

        // Remove role
        await db.collection('roles').deleteMany({ _orgId: metaOrg._id, name: 'admin' });
      }
    });
  }

  return migrations;
};
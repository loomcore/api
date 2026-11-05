import { describe, it, expect, beforeEach, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { initializeTypeBox } from '@loomcore/common/validation';
import { EmptyUserContext, getSystemUserContext, IOrganization, IUserContext } from '@loomcore/common/models';
import { ObjectId } from 'mongodb';

import { buildOrganizationTenantDomain, OrganizationService } from '../organization.service.js';
import { OrganizationDomainService } from '../organization-domain.service.js';
import { BadRequestError, DuplicateKeyError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import {
  getTestMetaOrgAdminUserContext,
  getTestMetaOrgUserContext,
  getTestMetaOrg,
  getTestOrgUserContext,
  getTestMetaOrgUser,
} from '../../__tests__/test-objects.js';
import { MongoDBDatabase } from '../../databases/mongo-db/mongo-db.database.js';
import { EmailService } from '../email.service.js';
import { UserService } from '../user.service.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  initializeTypeBox();
});

describe('OrganizationService', () => {
  let service: OrganizationService;
  let organizationDomainService: OrganizationDomainService;
  let database: Awaited<ReturnType<typeof TestExpressApp.init>>['database'];

  // Set up the test environment once before all tests
  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
    testUtils.initialize(setup.database);

    // Create service with real database
    service = new OrganizationService(setup.database);
    organizationDomainService = new OrganizationDomainService(setup.database);
  });

  afterAll(async () => {
    await testUtils.cleanup();
    await TestExpressApp.cleanup();
  });

  // Set up before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();
  });

  describe('findByDomain', () => {
    it('should resolve an organization from a domain via organizationDomains (login path)', async () => {
      const domain = 'dev.myorg.com';
      const referer = `https://${domain}/products`;
      const host = referer.split('/')[2];

      const createdOrg = await service.create(getSystemUserContext(), {
        name: 'My Org',
        code: 'my-org',
        status: 1,
        isMetaOrg: true,
      });
      expect(createdOrg?._id).toBeDefined();

      await organizationDomainService.create(getSystemUserContext(), {
        organizationId: createdOrg!._id,
        domain,
      });

      const found = await service.findByDomain(EmptyUserContext, host);

      expect(found).toBeDefined();
      expect(found?._id).toBe(createdOrg!._id);
      expect(found?.code).toBe('my-org');
      expect(found?.isMetaOrg).toBe(true);
    });

    it('should resolve an organization when org/domain docs are inserted raw (production seed shape)', async () => {
      // Only meaningful against MongoDB — mirrors Compass/migration-inserted documents
      if (process.env.TEST_DATABASE !== 'mongodb') {
        return;
      }

      const domain = 'dev.myorg.com';
      const orgObjectId = new ObjectId('6a7543b9d4ab1738ec10ee79');
      const domainObjectId = new ObjectId('6a7543b9d4ab1738ec10ee7a');

      // Access the underlying native Db used by MongoDBDatabase
      const nativeDb = (database as MongoDBDatabase as any).db;
      expect(nativeDb).toBeDefined();

      await nativeDb.collection('organizations').insertOne({
        _id: orgObjectId,
        name: 'My Org',
        code: 'my-org',
        description: null,
        status: 1,
        isMetaOrg: true,
        authToken: null,
        _created: new Date('2026-08-07T02:32:25.923Z'),
        _createdBy: 'system',
        _updated: new Date('2026-08-07T02:32:25.923Z'),
        _updatedBy: 'system',
        _deleted: null,
        _deletedBy: null,
      });

      await nativeDb.collection('organizationDomains').insertOne({
        _id: domainObjectId,
        organizationId: orgObjectId,
        domain,
        _created: new Date('2026-08-07T02:32:25.927Z'),
        _createdBy: 'system',
        _updated: new Date('2026-08-07T02:32:25.927Z'),
        _updatedBy: 'system',
      });

      // Sanity: confirm raw docs are queryable with the same filter findByDomain builds
      const rawDomain = await nativeDb.collection('organizationDomains').findOne({ domain });
      expect(rawDomain).toBeTruthy();
      expect(rawDomain.organizationId.toString()).toBe(orgObjectId.toString());

      const found = await service.findByDomain(EmptyUserContext, domain);

      expect(found).toBeDefined();
      expect(found?._id).toBe(orgObjectId.toString());
      expect(found?.name).toBe('My Org');
    });

    it('should return null when domain is not registered', async () => {
      const found = await service.findByDomain(EmptyUserContext, 'unknown.example.com');
      expect(found).toBeNull();
    });

    it('should resolve a tenant domain case-insensitively', async () => {
      const domain = 'acme.localhost';
      const createdOrg = await service.create(getSystemUserContext(), {
        name: 'Acme Domain Org',
        code: 'acme-domain',
        status: 1,
        isMetaOrg: false,
      });

      await organizationDomainService.create(getSystemUserContext(), {
        organizationId: createdOrg!._id,
        domain,
      });

      const found = await service.findByDomain(EmptyUserContext, 'ACME.LocalHost');
      expect(found?._id).toBe(createdOrg!._id);
    });
  });

  describe('preprocessEntity', () => {
    it('should throw BadRequestError when trying to create a metaOrg if one already exists', async () => {
      // Arrange: Create the first metaOrg
      const firstMetaOrg: Partial<IOrganization> = {
        name: 'First Meta Organization',
        code: 'first-meta-org',
        status: 1,
        isMetaOrg: true,
      };

      await service.create(getTestMetaOrgUserContext(), firstMetaOrg);

      // Act & Assert: Try to create a second metaOrg and expect BadRequestError
      const secondMetaOrg: Partial<IOrganization> = {
        name: 'Second Meta Organization',
        code: 'second-meta-org',
        status: 1,
        isMetaOrg: true,
      };

      await expect(
        service.create(getTestMetaOrgUserContext(), secondMetaOrg)
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.create(getTestMetaOrgUserContext(), secondMetaOrg)
      ).rejects.toThrow('Meta organization already exists');
    });

    it('should allow creating a metaOrg when none exists', async () => {
      // Arrange
      const metaOrg = getTestMetaOrg();

      // Act
      const result = await service.create(getTestMetaOrgUserContext(), metaOrg);

      // Assert
      expect(result).toBeDefined();
      expect(result?.isMetaOrg).toBe(true);
      expect(result?.name).toBe('Test Meta Organization');
    });

    it('should throw BadRequestError when non-metaOrg user tries to create an organization', async () => {
      // Arrange: Create a metaOrg first
      const metaOrg = getTestMetaOrg();

      const createdMetaOrg = await service.create(getTestMetaOrgUserContext(), metaOrg);
      expect(createdMetaOrg).toBeDefined();

      // Act & Assert: Try to create a regular org with a non-metaOrg userContext
      const regularOrg: Partial<IOrganization> = {
        name: 'Regular Organization',
        code: 'regular-org',
        status: 1,
        isMetaOrg: false,
      };

      await expect(
        service.create(getTestOrgUserContext(), regularOrg)
      ).rejects.toThrow(BadRequestError);

      await expect(
        service.create(getTestOrgUserContext(), regularOrg)
      ).rejects.toThrow('User is not authorized to create an organization');
    });

    it('should allow metaOrg user to create a regular organization', async () => {
      // Arrange: Create a metaOrg first
      const metaOrg = getTestMetaOrg();

      const createdMetaOrg = await service.create(getTestMetaOrgUserContext(), metaOrg);
      expect(createdMetaOrg).toBeDefined();
      expect(createdMetaOrg?._id).toBeDefined();

      if (!createdMetaOrg || !createdMetaOrg._id) {
        throw new Error('Failed to create metaOrg for test');
      }

      // Create a userContext with the actual metaOrg _id
      const metaOrgUserContext: IUserContext = {
        user: getTestMetaOrgUser(),
        features: ['metaorgUser'],
      };

      // Act: Create a regular org with metaOrg userContext
      const regularOrg: Partial<IOrganization> = {
        name: 'Regular Organization',
        code: 'regular-org',
        status: 1,
        isMetaOrg: false,
      };

      const result = await service.create(metaOrgUserContext, regularOrg);

      // Assert
      expect(result).toBeDefined();
      expect(result?.isMetaOrg).toBe(false);
      expect(result?.name).toBe('Regular Organization');
    });
  });

  describe('createOrganizationWithAdmin', () => {
    let userService: UserService;

    beforeEach(async () => {
      await testUtils.setupTestUsers();
      userService = new UserService(database);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cleans up the half-built org when a later step fails', async () => {
      vi.spyOn(EmailService.prototype, 'sendWelcomeEmail').mockRejectedValue(new Error('smtp down'));

      const payload = {
        name: 'Cleanup Tenant',
        code: 'cleanup-tenant',
        adminEmail: 'cleanup-admin@example.com',
      };

      await expect(
        service.createOrganizationWithAdmin(getTestMetaOrgAdminUserContext(), payload),
      ).rejects.toThrow();

      const leftoverOrg = await service.findOne(getSystemUserContext(), {
        filters: { code: { eq: payload.code } },
      });
      expect(leftoverOrg).toBeNull();

      const leftoverDomain = await organizationDomainService.findOne(getSystemUserContext(), {
        filters: { domain: { eq: buildOrganizationTenantDomain(payload.code) } },
      });
      expect(leftoverDomain).toBeNull();

      const leftoverUser = await userService.findOne(getSystemUserContext(), {
        filters: { email: { eq: payload.adminEmail } },
      });
      expect(leftoverUser).toBeNull();
    });

    it('stores a mixed-case code as lowercase and builds a lowercase tenant domain', async () => {
      vi.spyOn(EmailService.prototype, 'sendWelcomeEmail').mockResolvedValue();

      const result = await service.createOrganizationWithAdmin(getTestMetaOrgAdminUserContext(), {
        name: 'Mixed Case Tenant',
        code: '  AcMe  ',
        adminEmail: 'mixed-case-admin@example.com',
      });

      expect(result.organization.code).toBe('acme');

      const createdDomain = await organizationDomainService.findOne(getSystemUserContext(), {
        filters: { domain: { eq: buildOrganizationTenantDomain('acme') } },
      });
      expect(createdDomain).toBeDefined();
      expect(createdDomain?.domain).toBe(buildOrganizationTenantDomain('acme'));
    });

    it('defaults adminDisplayName to Admin User when it is omitted', async () => {
      vi.spyOn(EmailService.prototype, 'sendWelcomeEmail').mockResolvedValue();

      const result = await service.createOrganizationWithAdmin(getTestMetaOrgAdminUserContext(), {
        name: 'Default Name Tenant',
        code: 'default-name',
        adminEmail: 'default-name-admin@example.com',
      });

      expect(result.adminUser.displayName).toBe('Admin User');
      expect(result.adminUser.password).toBeUndefined();
    });
  });

  describe('organization code normalization', () => {
    it('stores a mixed-case code as lowercase on create', async () => {
      const created = await service.create(getTestMetaOrgUserContext(), {
        name: 'Mixed Case Create',
        code: '  AcMe  ',
        status: 1,
        isMetaOrg: false,
      });

      expect(created?.code).toBe('acme');
    });

    it('stores a mixed-case code as lowercase on update', async () => {
      const created = await service.create(getTestMetaOrgUserContext(), {
        name: 'Mixed Case Update',
        code: 'original-code',
        status: 1,
        isMetaOrg: false,
      });
      if (!created?._id) {
        throw new Error('Organization not created or missing ID');
      }

      const updated = await service.partialUpdateById(
        getTestMetaOrgUserContext(),
        created._id,
        { code: 'New-Code' },
      );

      expect(updated.code).toBe('new-code');
    });

    it('finds an organization by mixed-case code', async () => {
      await service.create(getTestMetaOrgUserContext(), {
        name: 'Lookup Org',
        code: 'lookup-org',
        status: 1,
        isMetaOrg: false,
      });

      const found = await service.getByCode(getTestMetaOrgUserContext(), 'Lookup-ORG');
      expect(found?.code).toBe('lookup-org');
    });

    it('throws DuplicateKeyError when creating Acme if acme already exists', async () => {
      await service.create(getTestMetaOrgUserContext(), {
        name: 'Acme One',
        code: 'acme',
        status: 1,
        isMetaOrg: false,
      });

      await expect(
        service.create(getTestMetaOrgUserContext(), {
          name: 'Acme Two',
          code: 'Acme',
          status: 1,
          isMetaOrg: false,
        }),
      ).rejects.toThrow(DuplicateKeyError);
    });

    it('validates a repo auth token when orgCode case differs', async () => {
      const created = await service.create(getTestMetaOrgUserContext(), {
        name: 'Repo Auth Org',
        code: 'repo-auth',
        status: 1,
        isMetaOrg: false,
        authToken: 'repo-token',
      });

      if (!created?._id) {
        throw new Error('Organization not created or missing ID');
      }

      const orgId = await service.validateRepoAuthToken(
        getTestMetaOrgUserContext(),
        'REPO-AUTH',
        'repo-token',
      );
      expect(orgId).toBe(created._id);
    });
  });
});


import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IOrganization, IUserContext } from '@loomcore/common/models';

import { OrganizationService } from '../organization.service.js';
import { IdNotFoundError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { Database } from '../../databases/database.js';

describe('OrganizationService - Integration Tests', () => {
  let database: Database;
  let service: OrganizationService;
  let testUserContext: IUserContext;
  
  // Set up TestExpressApp before all tests
  beforeAll(async () => {
    const testSetup = await TestExpressApp.init('test-organizations');
    database = testSetup.database;
    testUserContext = testUtils.testUserContext;
    // Create service
    service = new OrganizationService(database);
  });
  
  // Clean up TestExpressApp after all tests
  afterAll(async () => {
    await TestExpressApp.cleanup();
  });
  
  // Clear collections before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();
  });

  describe('getAuthTokenByRepoCode', () => {
    it('should return auth token when organization exists', async () => {
      // Arrange
      const authToken = 'test-auth-token-123';
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: 'test-org',
        authToken: authToken
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      // Act
      const result = await service.getAuthTokenByRepoCode(testUserContext, createdOrg._id);

      // Assert
      expect(result).toBe(authToken);
    });

    it('should throw IdNotFoundError when organization does not exist', async () => {
      // Arrange
      const nonExistentOrgId = testUtils.getRandomId();

      // Act & Assert
      await expect(
        service.getAuthTokenByRepoCode(testUserContext, nonExistentOrgId)
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should return undefined when organization exists but has no authToken', async () => {
      // Arrange
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization Without Token',
        code: 'test-org-no-token'
        // authToken is intentionally omitted
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      // Act
      const result = await service.getAuthTokenByRepoCode(testUserContext, createdOrg._id);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('validateRepoAuthToken', () => {
    it('should return orgId when auth token is valid', async () => {
      // Arrange
      const orgCode = 'test-org-code';
      const authToken = 'valid-auth-token-456';
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: orgCode,
        authToken: authToken
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      // Act
      const result = await service.validateRepoAuthToken(testUserContext, orgCode, authToken);

      // Assert
      expect(result).toBe(createdOrg._id);
    });

    it('should return null when auth token is invalid', async () => {
      // Arrange
      const orgCode = 'test-org-code';
      const validAuthToken = 'valid-auth-token-456';
      const invalidAuthToken = 'invalid-auth-token';
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: orgCode,
        authToken: validAuthToken
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      await service.create(testUserContext, preparedOrg);

      // Act
      const result = await service.validateRepoAuthToken(testUserContext, orgCode, invalidAuthToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when organization with code does not exist', async () => {
      // Arrange
      const nonExistentCode = 'non-existent-code';
      const authToken = 'some-auth-token';

      // Act
      const result = await service.validateRepoAuthToken(testUserContext, nonExistentCode, authToken);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle case where organization exists but has no authToken', async () => {
      // Arrange
      const orgCode = 'test-org-no-token';
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: orgCode
        // authToken is intentionally omitted
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      await service.create(testUserContext, preparedOrg);

      // Act
      const result = await service.validateRepoAuthToken(testUserContext, orgCode, 'some-token');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getMetaOrg', () => {
    it('should return meta organization when it exists', async () => {
      // Arrange
      const metaOrgData: Partial<IOrganization> = {
        name: 'Meta Organization',
        code: 'meta-org',
        isMetaOrg: true
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, metaOrgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg) {
        throw new Error('Meta organization not created');
      }

      // Act
      const result = await service.getMetaOrg(testUserContext);

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.isMetaOrg).toBe(true);
      expect(result!.name).toBe('Meta Organization');
      expect(result!._id).toBe(createdOrg._id);
    });

    it('should return null when meta organization does not exist', async () => {
      // Arrange
      // Create a regular organization (not meta)
      const regularOrgData: Partial<IOrganization> = {
        name: 'Regular Organization',
        code: 'regular-org',
        isMetaOrg: false
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, regularOrgData, true);
      await service.create(testUserContext, preparedOrg);

      // Act & Assert
      const result = await service.getMetaOrg(testUserContext);
      expect(result).toBeNull();
    });

    it('should return the correct meta organization when multiple organizations exist', async () => {
      // Arrange
      const regularOrgData1: Partial<IOrganization> = {
        name: 'Regular Organization 1',
        code: 'regular-org-1',
        isMetaOrg: false
      };
      
      const regularOrgData2: Partial<IOrganization> = {
        name: 'Regular Organization 2',
        code: 'regular-org-2',
        isMetaOrg: false
      };
      
      const metaOrgData: Partial<IOrganization> = {
        name: 'Meta Organization',
        code: 'meta-org',
        isMetaOrg: true
      };
      
      const preparedRegular1 = await service.preprocessEntity(testUserContext, regularOrgData1, true);
      const preparedRegular2 = await service.preprocessEntity(testUserContext, regularOrgData2, true);
      const preparedMeta = await service.preprocessEntity(testUserContext, metaOrgData, true);
      
      await service.create(testUserContext, preparedRegular1);
      await service.create(testUserContext, preparedRegular2);
      const createdMeta = await service.create(testUserContext, preparedMeta);
      
      if (!createdMeta) {
        throw new Error('Meta organization not created');
      }

      // Act
      const result = await service.getMetaOrg(testUserContext);

      // Assert
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.isMetaOrg).toBe(true);
      expect(result!._id).toBe(createdMeta._id);
    });
  });

  describe('Inherited CRUD Operations', () => {
    it('should create an organization', async () => {
      // Arrange
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: 'test-org'
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);

      // Act
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      // Assert
      expect(createdOrg).toBeDefined();
      expect(createdOrg!.name).toBe(orgData.name);
      expect(createdOrg!.code).toBe(orgData.code);
      expect(createdOrg!._id).toBeDefined();
    });

    it('should retrieve an organization by ID', async () => {
      // Arrange
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: 'test-org'
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      // Act
      const retrievedOrg = await service.getById(testUserContext, createdOrg._id);
      
      // Assert
      expect(retrievedOrg).toBeDefined();
      expect(retrievedOrg!._id).toBe(createdOrg._id);
      expect(retrievedOrg!.name).toBe(orgData.name);
      expect(retrievedOrg!.code).toBe(orgData.code);
    });

    it('should find an organization by code', async () => {
      // Arrange
      const orgCode = 'unique-org-code';
      const orgData: Partial<IOrganization> = {
        name: 'Test Organization',
        code: orgCode
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      await service.create(testUserContext, preparedOrg);

      // Act
      const foundOrg = await service.findOne(testUserContext, { filters: { code: { eq: orgCode } } });
      
      // Assert
      expect(foundOrg).toBeDefined();
      expect(foundOrg?.code).toBe(orgCode);
      expect(foundOrg?.name).toBe('Test Organization');
    });

    it('should update an organization', async () => {
      // Arrange
      const orgData: Partial<IOrganization> = {
        name: 'Original Name',
        code: 'test-org'
      };
      
      const createdOrg = await service.create(testUserContext, orgData);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      const updateData: Partial<IOrganization> = {
        name: 'Updated Name'
      };

      // Act
      const updatedOrg = await service.partialUpdateById(testUserContext, createdOrg._id, updateData);
      
      // Assert
      expect(updatedOrg).toBeDefined();
      expect(updatedOrg?.name).toBe('Updated Name');
      expect(updatedOrg?.code).toBe(orgData.code);
    });

    it('should delete an organization', async () => {
      // Arrange
      const orgData: Partial<IOrganization> = {
        name: 'Organization to Delete',
        code: 'delete-org'
      };
      
      const preparedOrg = await service.preprocessEntity(testUserContext, orgData, true);
      const createdOrg = await service.create(testUserContext, preparedOrg);
      
      if (!createdOrg || !createdOrg._id) {
        throw new Error('Organization not created');
      }

      // Act
      await service.deleteById(testUserContext, createdOrg._id);
      
      // Assert
      await expect(
        service.getById(testUserContext, createdOrg._id)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
});


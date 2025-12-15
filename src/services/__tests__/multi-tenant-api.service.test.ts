import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { IUserContext, IQueryOptions, DefaultQueryOptions, IEntity } from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';

import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { TenantQueryDecorator } from '../tenant-query-decorator.js';
import { BadRequestError, IdNotFoundError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { getTestMetaOrgUserContext, getTestMetaOrgUser, getTestMetaOrg } from '../../__tests__/test-objects.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  initializeTypeBox();
});

describe('MultiTenantApiService', () => {
  let service: MultiTenantApiService<TestEntity>;

  // Test data
  const otherOrgId = 'org-456';

  // Set up the test environment once before all tests
  beforeAll(async () => {
    const setup = await TestExpressApp.init();

    // Create service with real database
    service = new MultiTenantApiService<TestEntity>(
      setup.database,
      'testEntities',
      'testEntity',
      testModelSpec
    );
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  // Set up before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    // Spy on TenantQueryDecorator methods to verify they're called
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQuery');
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQueryOptions');
    vi.spyOn(TenantQueryDecorator.prototype, 'getOrgIdField');
  });

  // Test protected methods directly
  describe('prepareQuery', () => {
    it('should call TenantQueryDecorator.applyTenantToQuery with correct parameters', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const query = { name: 'Test' };

      // Get the protected method and bind it to the service instance
      const prepareQuery = (service as any).prepareQuery.bind(service);

      // Act
      prepareQuery(userContext, query);

      // Assert
      expect(TenantQueryDecorator.prototype.applyTenantToQuery).toHaveBeenCalledWith(
        userContext,
        query,
        'testEntities'
      );
    });

    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const query = { name: 'Test' };

      // Get the protected method and bind it to the service instance
      const prepareQuery = (service as any).prepareQuery.bind(service);

      // Act & Assert
      expect(() => prepareQuery(undefined, query)).toThrow(BadRequestError);
    });

    it('should override consumer-supplied _orgId with userContext _orgId', () => {
      // Arrange
      // Consumer is trying to supply their own _orgId (this should be ignored/overwritten)
      const query: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } }
      };

      // Act
      const result = service.prepareQuery(getTestMetaOrgUserContext(), query, []);

      // Assert
      // The consumer-supplied _orgId should be completely overwritten by userContext.organization?_orgId
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: getTestMetaOrg()._id });
      expect(result.queryObject.filters!['_orgId']).not.toEqual({ eq: otherOrgId });
    });
  });

  describe('prepareQueryOptions', () => {
    it('should call TenantQueryDecorator.applyTenantToQueryOptions with the provided options', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } }
      };

      // Act
      const result = service.prepareQuery(userContext, queryOptions, []);

      // Assert
      expect(result.queryObject.filters).toBeDefined();
      expect(result.queryObject.filters!['name']).toEqual({ eq: 'Test' });
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: userContext.organization ? userContext.organization._id : undefined });
    });

    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions
      };

      // Act & Assert
      expect(() => service.prepareQuery(undefined as unknown as IUserContext, queryOptions, [])).toThrow(BadRequestError);
    });

    it('should override consumer-supplied _orgId filter with userContext _orgId', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        // Consumer is trying to supply their own _orgId (this should be ignored/overwritten)
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } }
      };

      // Act
      const result = service.prepareQuery(userContext, queryOptions, []);

      // Assert
      expect(result.queryObject.filters).toBeDefined();
      expect(result.queryObject.filters!['name']).toEqual({ eq: 'Test' });
      // The consumer-supplied _orgId should be completely overwritten by userContext.organization?_orgId
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: userContext.organization ? userContext.organization._id : undefined });
      expect(result.queryObject.filters!['_orgId']).not.toEqual({ eq: otherOrgId });
    });
  });

  describe('prepareEntity', () => {
    it('should add tenant ID to entity', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preprocessEntity.bind(service);

      // Act
      const result = await preparedEntity(userContext, entity, true);

      // Assert
      expect(result).toHaveProperty('_orgId', getTestMetaOrg()._id);
    });

    it('should throw BadRequestError if userContext is undefined', async () => {
      // Arrange
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preprocessEntity.bind(service);

      // Act & Assert
      await expect(preparedEntity(undefined as unknown as IUserContext, entity, true)).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if userContext has no organization', async () => {
      // Arrange
      const userContextWithoutOrg = {
        user: {
          _id: getTestMetaOrgUser()._id,
          _orgId: getTestMetaOrg()._id,
          email: 'test@example.com',
          password: '',
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system'
        },
        authorizations: [{
          _id: testUtils.getRandomId(),
          _orgId: getTestMetaOrgUser()._orgId,
          role: 'testUser',
          feature: 'testUser',
        }],
      };
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preprocessEntity.bind(service);

      // Act & Assert
      await expect(preparedEntity(userContextWithoutOrg, entity, true)).rejects.toThrow(BadRequestError);
    });
  });

  // Test public methods
  describe('getAll', () => {
    it('should call prepareQuery and return entities', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const testEntity: TestEntity = {
        _id: testUtils.getRandomId(),
        name: 'Test Entity',
        _orgId: getTestMetaOrg()._id,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system'
      };

      // Insert a test entity directly into the database
      await service.create(userContext, {
        _id: testEntity._id,
        name: testEntity.name,
        _orgId: testEntity._orgId
      });

      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareQuery');

      // Act
      const result = await service.getAll(userContext);

      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, {}, []);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('get', () => {
    it('should call prepareQueryOptions with the provided options', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } }
      };

      // Act
      const result = await service.get(userContext, queryOptions);

      // Assert
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });
  });

  describe('create', () => {
    it('should create an entity with tenant ID', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };

      // Act
      const created = await service.create(userContext, entity);

      // Assert
      expect(created).toBeDefined();
      expect(created?._id).toBeDefined();
      expect(created?.name).toBe('Test Entity');
      expect(created?._orgId).toBe(getTestMetaOrg()._id);

      // Verify it was actually inserted into the database
      const dbEntity = await service.getById(userContext, created!._id);
      expect(dbEntity).toBeDefined();
      expect(dbEntity?.name).toBe('Test Entity');
      expect(dbEntity?._orgId).toBe(getTestMetaOrg()._id);
    });
  });

  describe('partialUpdateById', () => {
    it('should update an entity by ID', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const testEntityId = testUtils.getRandomId();

      // Insert a test entity directly into the database
      await service.create(userContext, {
        _id: testEntityId,
        name: 'Original Name',
        _orgId: getTestMetaOrg()._id
      } as Partial<TestEntity>);

      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name'
      };

      // Act
      const updated = await service.partialUpdateById(userContext, testEntityId, updateEntity);

      // Assert
      expect(updated).toBeDefined();
      expect(updated._id).toBe(testEntityId);
      expect(updated.name).toBe('Updated Name');
      expect(updated._orgId).toBe(getTestMetaOrg()._id);
    });

    it('should throw IdNotFoundError if entity not found', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const nonExistentId = testUtils.getRandomId();
      const entity: Partial<TestEntity> = {
        name: 'Updated Name'
      };

      // Act & Assert
      await expect(
        service.partialUpdateById(userContext, nonExistentId, entity)
      ).rejects.toThrow(IdNotFoundError);
    });
  });

  describe('deleteById', () => {
    it('should delete an entity by ID', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const testEntityId = testUtils.getRandomId();

      // Insert a test entity directly into the database
      await service.create(userContext, {
        _id: testEntityId,
        name: 'Test Entity',
        _orgId: getTestMetaOrg()._id
      } as Partial<TestEntity>);

      // Verify it exists
      const beforeDelete = await service.getById(userContext, testEntityId);
      expect(beforeDelete).toBeDefined();

      // Act
      const deleteResult = await service.deleteById(userContext, testEntityId);

      // Assert
      expect(deleteResult).toBeDefined();
      expect(deleteResult.count).toBe(1);
      expect(deleteResult.success).toBe(true);

      // Verify it was actually deleted
      await expect(service.getById(userContext, testEntityId)).rejects.toThrow(IdNotFoundError);
    });

    it('should throw IdNotFoundError if no entity found', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const nonExistentId = testUtils.getRandomId();

      // Act & Assert
      await expect(
        service.deleteById(userContext, nonExistentId)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
}); 
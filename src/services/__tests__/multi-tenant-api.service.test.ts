import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { Db, Collection, FindCursor, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IUserContext, QueryOptions, IEntity } from '@loomcore/common/models';
import { TypeboxObjectId } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';

import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { TenantQueryDecorator } from '../tenant-query-decorator.js';
import { BadRequestError, ServerError, IdNotFoundError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';

// Mock entity interface matching the service generic type
interface TestEntity extends IEntity {
  name: string;
  description?: string;
  _orgId?: string;
}

// Define TypeBox schema for test entity with proper ObjectId handling
const TestEntitySchema = Type.Object({
  _id: TypeboxObjectId(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  _orgId: Type.Optional(Type.String())
});

// Create a model spec for the test entity
const TestEntityModelSpec = entityUtils.getModelSpec(TestEntitySchema);

// Creates a valid MongoDB ObjectId string
const createValidObjectId = () => new ObjectId().toString();

describe('MultiTenantApiService', () => {
  // Mock dependencies
  let db: Db;
  let mockCollection: Collection;
  let mockFindCursor: FindCursor;
  let service: MultiTenantApiService<TestEntity>;
  
  // Test data
  const testOrgId = testUtils.testOrgId;
  const otherOrgId = 'org-456';
  // Generate a valid ObjectId string for testing
  const validObjectIdString = createValidObjectId();
  const testEntity: TestEntity = {
    _id: validObjectIdString, // Use string ID to match the model interface
    name: 'Test Entity'
  };
  
  // Set up the test environment once before all tests
  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    db = setup.db;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });
  
  // Set up mocks before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    
    // Mock MongoDB collection methods
    mockFindCursor = {
      toArray: vi.fn().mockResolvedValue([]),
    } as unknown as FindCursor;
    
    mockCollection = {
      find: vi.fn().mockReturnValue(mockFindCursor),
      findOne: vi.fn().mockResolvedValue({
        _id: new ObjectId(validObjectIdString), // MongoDB returns ObjectId
        name: 'Original Name',
        _orgId: testOrgId,
        created: new Date(),
        createdBy: 'test-user'
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ok: 1,
        value: {
          _id: new ObjectId(validObjectIdString), // MongoDB returns ObjectId
          name: 'Updated Name',
          _orgId: testOrgId,
          created: new Date(),
          createdBy: 'test-user',
          updated: new Date(),
          updatedBy: 'test-user'
        }
      }),
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      countDocuments: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockReturnValue({
        next: vi.fn().mockResolvedValue({
          results: [],
          total: [{ total: 0 }]
        })
      }),
    } as unknown as Collection;
    
    const mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    } as unknown as Db;
    
    // Create the service to test with model spec
    service = new MultiTenantApiService<TestEntity>(
      mockDb,
      'testEntities',
      'testEntity',
      TestEntityModelSpec
    );
    
    // Spy on TenantQueryDecorator methods to verify they're called
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQuery');
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQueryOptions');
    vi.spyOn(TenantQueryDecorator.prototype, 'getOrgIdField');
  });
  
  // Test protected methods directly
  describe('prepareQuery', () => {
    it('should call TenantQueryDecorator.applyTenantToQuery with correct parameters', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
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

    it('should override consumer-supplied orgId with userContext orgId', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      // Create query with a different orgId than the one in userContext
      const query = { name: 'Test', _orgId: otherOrgId };
      
      // Mock the TenantQueryDecorator.applyTenantToQuery implementation
      // to simulate real behavior since we're spying on it
      vi.mocked(TenantQueryDecorator.prototype.applyTenantToQuery).mockImplementationOnce(
        (userCtx, queryObj) => ({ ...queryObj, _orgId: userCtx._orgId })
      );
      
      // Get the protected method and bind it to the service instance
      const prepareQuery = (service as any).prepareQuery.bind(service);
      
      // Act
      const result = prepareQuery(userContext, query);
      
      // Assert
      expect(result._orgId).toBe(testOrgId);
      expect(result._orgId).not.toBe(otherOrgId);
    });
  });
  
  describe('prepareQueryOptions', () => {
    it('should call TenantQueryDecorator.applyTenantToQueryOptions with the provided options', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const queryOptions = new QueryOptions();
      queryOptions.filters = { name: { eq: 'Test' } };
      
      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareQueryOptions');
      
      // Act
      service.get(userContext, queryOptions);
      
      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, queryOptions);
    });

    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const queryOptions = new QueryOptions();
      
      // Get the protected method and bind it to the service instance
      const prepareQueryOptions = (service as any).prepareQueryOptions.bind(service);
      
      // Act & Assert
      expect(() => prepareQueryOptions(undefined, queryOptions)).toThrow(BadRequestError);
    });

    it('should override consumer-supplied orgId filter with userContext orgId', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const queryOptions = new QueryOptions();
      // Create filter with a different orgId than the one in userContext
      queryOptions.filters = { name: { eq: 'Test' }, orgId: { eq: otherOrgId } };
      
      // Mock the TenantQueryDecorator.applyTenantToQueryOptions implementation
      // to simulate real behavior since we're spying on it
      vi.mocked(TenantQueryDecorator.prototype.applyTenantToQueryOptions).mockImplementationOnce(
        (userCtx, options) => {
          const newOptions = new QueryOptions(options);
          if (!newOptions.filters) {
            newOptions.filters = {};
          }
          // This mirrors the actual implementation which overwrites any existing orgId filter
          newOptions.filters._orgId = { eq: userCtx._orgId };
          return newOptions;
        }
      );
      
      // Get the protected method and bind it to the service instance
      const prepareQueryOptions = (service as any).prepareQueryOptions.bind(service);
      
      // Act
      const result = prepareQueryOptions(userContext, queryOptions);
      
      // Assert
      expect(result.filters?._orgId?.eq).toBe(testOrgId);
      expect(result.filters?._orgId?.eq).not.toBe(otherOrgId);
    });
  });
  
  describe('prepareEntity', () => { 
    it('should add tenant ID to entity', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const entity: TestEntity = { ...testEntity };
      
      // Get the protected method and bind it to the service instance
      const prepareEntity = (service as any).prepareEntity.bind(service);
      
      // Act
      const result = await prepareEntity(userContext, entity, true);
      
      // Assert
      expect(result).toHaveProperty('_orgId', testOrgId);
    });
    
    it('should throw BadRequestError if userContext is undefined', async () => {
      // Arrange
      const entity: TestEntity = { ...testEntity };
      
      // Get the protected method and bind it to the service instance
      const prepareEntity = (service as any).prepareEntity.bind(service);
      
      // Act & Assert
      await expect(prepareEntity(undefined, entity, true)).rejects.toThrow(BadRequestError);
    });
    
    it('should throw BadRequestError if userContext has no orgId', async () => {
      // Arrange
      const userContextWithoutOrg: IUserContext = {
        user: { 
          _id: testUtils.testUserId,
          email: 'test@example.com',
          password: '',
          _created: new Date(),
          _createdBy: 'system',
          _updated: new Date(),
          _updatedBy: 'system'
        }
      };
      const entity: TestEntity = { ...testEntity };
      
      // Get the protected method and bind it to the service instance
      const prepareEntity = (service as any).prepareEntity.bind(service);
      
      // Act & Assert
      await expect(prepareEntity(userContextWithoutOrg, entity, true)).rejects.toThrow(BadRequestError);
    });
  });
  
  // Test public methods
  describe('getAll', () => {
    it('should call prepareQuery and pass the result to find', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      
      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareQuery');
      
      // Act
      await service.getAll(userContext);
      
      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, {});
      expect(mockCollection.find).toHaveBeenCalled();
    });
  });
  
  describe('get', () => {
    it('should call prepareQueryOptions with the provided options', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const queryOptions = new QueryOptions();
      queryOptions.filters = { name: { eq: 'Test' } };
      
      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareQueryOptions');
      
      // Act
      await service.get(userContext, queryOptions);
      
      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, queryOptions);
    });
  });
  
  describe('create', () => {
    it('should call prepareEntity and pass the preparedEntity to insertOne', async () => {
      // Spy on the onBeforeCreate method which is called by create
      const spy = vi.spyOn(service as any, 'onBeforeCreate')
        .mockResolvedValue({ ...testEntity, _orgId: testOrgId });
      
      // Arrange
      const userContext = testUtils.testUserContext;
      const entity: TestEntity = { ...testEntity };
      
      // Act
      await service.create(userContext, entity);
      
      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, entity);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });
  
  describe('partialUpdateById', () => {
    it('should call prepareEntity and prepareQuery', async () => {
      // Spy on onBeforeUpdate which is called by partialUpdateById
      const onBeforeUpdateSpy = vi.spyOn(service as any, 'onBeforeUpdate')
        .mockResolvedValue({ ...testEntity, _orgId: testOrgId });
      const prepareQuerySpy = vi.spyOn(service as any, 'prepareQuery');
      
      // Arrange
      const userContext = testUtils.testUserContext;
      const entity: TestEntity = { ...testEntity };
      
      // Act
      await service.partialUpdateById(userContext, validObjectIdString, entity);
      
      // Assert
      expect(onBeforeUpdateSpy).toHaveBeenCalled();
      expect(prepareQuerySpy).toHaveBeenCalled();
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
    });
    
    it('should throw IdNotFoundError if entity not found', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const entity: TestEntity = { ...testEntity };
      
      // Mock onBeforeUpdate to avoid issues with async behavior
      vi.spyOn(service as any, 'onBeforeUpdate')
        .mockResolvedValue({ ...entity, _orgId: testOrgId });
      
      // Mock findOneAndUpdate to simulate not finding the entity
      mockCollection.findOneAndUpdate = vi.fn().mockResolvedValue(null);
      
      // Act & Assert
      await expect(
        service.partialUpdateById(userContext, validObjectIdString, entity)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
  
  describe('deleteById', () => {
    it('should call prepareQuery and pass the result to deleteOne', async () => {
      // Spy on the prepareQuery method
      const spy = vi.spyOn(service as any, 'prepareQuery');
      
      // Arrange
      const userContext = testUtils.testUserContext;
      
      // Act
      await service.deleteById(userContext, validObjectIdString);
      
      // Assert
      expect(spy).toHaveBeenCalled();
      expect(mockCollection.deleteOne).toHaveBeenCalled();
    });
    
    it('should throw IdNotFoundError if no entity found', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      
      // Mock deleteOne to return 0 deletedCount (no entity found)
      mockCollection.deleteOne = vi.fn().mockResolvedValue({ deletedCount: 0 });
      
      // Act & Assert
      await expect(
        service.deleteById(userContext, validObjectIdString)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
}); 
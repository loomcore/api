import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Db, Collection, FindCursor, ObjectId } from 'mongodb';
import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { TenantQueryDecorator } from '../tenant-query-decorator.js';
import { IUserContext, QueryOptions, IEntity } from '../../models/index.js';
import { BadRequestError } from '../../errors/index.js';
import { ServerError, IdNotFoundError } from '../../errors/index.js';

// Mock entity interface matching the service generic type
interface TestEntity extends IEntity {
  name: string;
  description?: string;
  _orgId?: string;
}

// Helper function to create a mock user context
const createUserContext = (orgId: string): IUserContext => ({
  user: { 
    _id: new ObjectId(), 
    email: 'test@example.com',
    password: '',
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system'
  },
  _orgId: orgId
});

// Creates a valid MongoDB ObjectId string
const createValidObjectId = () => new ObjectId().toString();

describe('[library] MultiTenantApiService', () => {
  // Mock dependencies
  let mockDb: Db;
  let mockCollection: Collection;
  let mockFindCursor: FindCursor;
  let service: MultiTenantApiService<TestEntity>;
  
  // Test data
  const testOrgId = 'org-123';
  const otherOrgId = 'org-456';
  // Generate a valid ObjectId string for testing
  const validObjectIdString = createValidObjectId();
  const testEntity: TestEntity = {
    _id: new ObjectId(validObjectIdString),
    name: 'Test Entity'
  };
  
  // Set up mocks before each test
  beforeEach(() => {
    // Mock MongoDB collection methods
    mockFindCursor = {
      toArray: vi.fn().mockResolvedValue([]),
    } as unknown as FindCursor;
    
    mockCollection = {
      find: vi.fn().mockReturnValue(mockFindCursor),
      findOne: vi.fn().mockResolvedValue({
        _id: new ObjectId(validObjectIdString),
        name: 'Original Name',
        _orgId: testOrgId,
        created: new Date(),
        createdBy: 'test-user'
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({
        ok: 1,
        value: {
          _id: new ObjectId(validObjectIdString),
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
    
    mockDb = {
      collection: vi.fn().mockReturnValue(mockCollection),
    } as unknown as Db;
    
    // Create the service to test
    service = new MultiTenantApiService<TestEntity>(
      mockDb,
      'testEntities',
      'testEntity'
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
      const userContext = createUserContext(testOrgId);
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
      const userContext = createUserContext(testOrgId);
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
      const userContext = createUserContext(testOrgId);
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
      const userContext = createUserContext(testOrgId);
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
    it('should add tenant ID to entity', () => {
      // Arrange
      const userContext = createUserContext(testOrgId);
      const entity: TestEntity = { ...testEntity };
      
      // Get the protected method and bind it to the service instance
      const prepareEntity = (service as any).prepareEntity.bind(service);
      
      // Act
      const result = prepareEntity(userContext, entity, true);
      
      // Assert
      expect(result).toHaveProperty('_orgId', testOrgId);
    });
    
    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const entity: TestEntity = { ...testEntity };
      
      // Get the protected method and bind it to the service instance
      const prepareEntity = (service as any).prepareEntity.bind(service);
      
      // Act & Assert
      expect(() => prepareEntity(undefined, entity, true)).toThrow(BadRequestError);
    });
    
    it('should throw BadRequestError if userContext has no orgId', () => {
      // Arrange
      const userContextWithoutOrg: IUserContext = {
        user: { 
          _id: new ObjectId(), 
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
      expect(() => prepareEntity(userContextWithoutOrg, entity, true)).toThrow(BadRequestError);
    });
  });
  
  // Test public methods
  describe('getAll', () => {
    it('should call prepareQuery and pass the result to find', async () => {
      // Arrange
      const userContext = createUserContext(testOrgId);
      
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
      const userContext = createUserContext(testOrgId);
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
      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareEntity');
      
      // Arrange
      const userContext = createUserContext(testOrgId);
      const entity: TestEntity = { ...testEntity };
      
      // Act
      await service.create(userContext, entity);
      
      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, entity, true);
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });
  
  describe('partialUpdateById', () => {
    it('should call prepareEntity and prepareQuery', async () => {
      // Spy on protected methods
      const prepareEntitySpy = vi.spyOn(service as any, 'prepareEntity');
      const prepareQuerySpy = vi.spyOn(service as any, 'prepareQuery');
      
      // Arrange
      const userContext = createUserContext(testOrgId);
      const entity: TestEntity = { ...testEntity };
      
      // Act
      await service.partialUpdateById(userContext, validObjectIdString, entity);
      
      // Assert
      expect(prepareEntitySpy).toHaveBeenCalled();
      expect(prepareQuerySpy).toHaveBeenCalled();
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalled();
    });
    
    it('should throw IdNotFoundError if entity not found', async () => {
      // Arrange
      const userContext = createUserContext(testOrgId);
      const entity: TestEntity = { ...testEntity };
      
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
      const userContext = createUserContext(testOrgId);
      
      // Act
      await service.deleteById(userContext, validObjectIdString);
      
      // Assert
      expect(spy).toHaveBeenCalled();
      expect(mockCollection.deleteOne).toHaveBeenCalled();
    });
    
    it('should throw IdNotFoundError if no entity found', async () => {
      // Arrange
      const userContext = createUserContext(testOrgId);
      
      // Mock deleteOne to return 0 deletedCount (no entity found)
      mockCollection.deleteOne = vi.fn().mockResolvedValue({ deletedCount: 0 });
      
      // Act & Assert
      await expect(
        service.deleteById(userContext, validObjectIdString)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
}); 
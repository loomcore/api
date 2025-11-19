import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IUserContext, IQueryOptions, DefaultQueryOptions, IEntity } from '@loomcore/common/models';
import { TypeboxObjectId, initializeTypeBox } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';

import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { TenantQueryDecorator } from '../tenant-query-decorator.js';
import { BadRequestError, ServerError, IdNotFoundError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { Database } from '../../databases/database.js';
import { IDatabase } from '../../databases/database.interface.js';
import { MongoDBDatabase } from '../../databases/mongoDb/database.mongo.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  initializeTypeBox();
});

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

describe('MultiTenantApiService', () => {
  let database: IDatabase;
  let service: MultiTenantApiService<TestEntity>;
  
  // Test data
  const testOrgId = testUtils.testOrgId;
  const otherOrgId = 'org-456';
  
  // Set up the test environment once before all tests
  beforeAll(async () => {
    const setup = await TestExpressApp.init('testEntities');
    database = setup.IDatabase;
    
    // Create service with real database
    service = new MultiTenantApiService<TestEntity>(
      setup.database,
      'testEntities',
      'testEntity',
      TestEntityModelSpec
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

    it('should override consumer-supplied _orgId with userContext _orgId', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      // Consumer is trying to supply their own _orgId (this should be ignored/overwritten)
      const query: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } }
      };
      
      // Act
      const result = service.prepareQuery(userContext, query, []);
      
      // Assert
      // The consumer-supplied _orgId should be completely overwritten by userContext._orgId
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: testOrgId });
      expect(result.queryObject.filters!['_orgId']).not.toEqual({ eq: otherOrgId });
    });
  });
  
  describe('prepareQueryOptions', () => {
    it('should call TenantQueryDecorator.applyTenantToQueryOptions with the provided options', () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } }
      };

      // Act
      const result = service.prepareQuery(userContext, queryOptions, []);

      // Assert
      expect(result.queryObject.filters).toBeDefined();
      expect(result.queryObject.filters!['name']).toEqual({ eq: 'Test' });
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: userContext._orgId });
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
      const userContext = testUtils.testUserContext;
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
      // The consumer-supplied _orgId should be completely overwritten by userContext._orgId
      expect(result.queryObject.filters!['_orgId']).toEqual({ eq: userContext._orgId });
      expect(result.queryObject.filters!['_orgId']).not.toEqual({ eq: otherOrgId });
    });
  });
  
  describe('prepareEntity', () => { 
    it('should add tenant ID to entity', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };
      
      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preprocessEntity.bind(service);
      
      // Act
      const result = await preparedEntity(userContext, entity, true);
      
      // Assert
      expect(result).toHaveProperty('_orgId', testOrgId);
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
      const userContext = testUtils.testUserContext;
      const testEntity: TestEntity = {
        _id: new ObjectId().toString(),
        name: 'Test Entity',
        _orgId: testOrgId
      };
      
      // Insert a test entity directly into the database
      await database.create({
        _id: new ObjectId(testEntity._id),
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
      const userContext = testUtils.testUserContext;
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
      const userContext = testUtils.testUserContext;
      const entity: Partial<TestEntity> = {
        name: 'Test Entity'
      };
      
      // Act
      const created = await service.create(userContext, entity);
      
      // Assert
      expect(created).toBeDefined();
      expect(created?._id).toBeDefined();
      expect(created?.name).toBe('Test Entity');
      expect(created?._orgId).toBe(testOrgId);
      
      // Verify it was actually inserted into the database
      const dbEntity = await database.getById<TestEntity>([], created!._id);
      expect(dbEntity).toBeDefined();
      expect(dbEntity?.name).toBe('Test Entity');
      expect(dbEntity?._orgId).toBe(testOrgId);
    });
  });
  
  describe('partialUpdateById', () => {
    it('should update an entity by ID', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const testEntityId = new ObjectId().toString();
      
      // Insert a test entity directly into the database
      await database.create({
        _id: new ObjectId(testEntityId),
        name: 'Original Name',
        _orgId: testOrgId
      });
      
      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name'
      };
      
      // Act
      const updated = await service.partialUpdateById(userContext, testEntityId, updateEntity);
      
      // Assert
      expect(updated).toBeDefined();
      expect(updated._id).toBe(testEntityId);
      expect(updated.name).toBe('Updated Name');
      expect(updated._orgId).toBe(testOrgId);
    });
    
    it('should throw IdNotFoundError if entity not found', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const nonExistentId = new ObjectId().toString();
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
      const userContext = testUtils.testUserContext;
      const testEntityId = new ObjectId().toString();
      
      // Insert a test entity directly into the database
      await database.create({
        _id: new ObjectId(testEntityId),
        name: 'Test Entity',
        _orgId: testOrgId
      });
      
      // Verify it exists
      const beforeDelete = await database.getById<TestEntity>([], testEntityId);
      expect(beforeDelete).toBeDefined();
      
      // Act
      const deleteResult = await service.deleteById(userContext, testEntityId);
      
      // Assert
      expect(deleteResult).toBeDefined();
      expect(deleteResult.count).toBe(1);
      expect(deleteResult.success).toBe(true);
      
      // Verify it was actually deleted
      const afterDelete = await database.getById<TestEntity>([], testEntityId);
      expect(afterDelete).toBeNull();
    });
    
    it('should throw IdNotFoundError if no entity found', async () => {
      // Arrange
      const userContext = testUtils.testUserContext;
      const nonExistentId = new ObjectId().toString();
      
      // Act & Assert
      await expect(
        service.deleteById(userContext, nonExistentId)
      ).rejects.toThrow(IdNotFoundError);
    });
  });
}); 
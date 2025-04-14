import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { GenericApiService } from '../generic-api.service.js';
import { IUserContext, QueryOptions, IEntity, IAuditable, EmptyUserContext } from '../../models/index.js';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { IdNotFoundError, DuplicateKeyError, BadRequestError } from '../../errors/index.js';
import { entityUtils } from '../../utils/entity.utils.js';
import moment from 'moment';
import { TypeboxIsoDate, TypeboxObjectId } from '../../validation/typebox-extensions.js';
import { initializeTypeBox } from '../../validation/typebox-setup.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  // Initialize TypeBox with custom formats and validators
  initializeTypeBox();
});

// Define a test entity interface
interface TestEntity extends IEntity, IAuditable {
  name: string;
  description?: string;
  isActive?: boolean;
  tags?: string[];
  count?: number;
}

// Create a model spec for validation
const TestEntitySchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  isActive: Type.Optional(Type.Boolean()),
  tags: Type.Optional(Type.Array(Type.String())),
  count: Type.Optional(Type.Number())
});

// Create model spec object
const testModelSpec = entityUtils.getModelSpec(TestEntitySchema, { isAuditable: true });

// Helper function to create a mock user context
const createUserContext = (): IUserContext => ({
  user: { 
    _id: new ObjectId(),
    email: 'test@example.com',
    password: '',
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system'
  },
  _orgId: '67e8e19b149f740323af93d7'
});

describe('[library] GenericApiService - Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let service: GenericApiService<TestEntity>;
  let collection: Collection;
  let mockUserContext: IUserContext;
  
  // Set up MongoDB Memory Server before all tests
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test-db');
    
    // Create service with auditable model spec
    service = new GenericApiService<TestEntity>(
      db,
      'testEntities',
      'testEntity',
      testModelSpec
    );
    
    mockUserContext = {
      user: {
        _id: new ObjectId('5f7d5dc35a3a3a0b8c7b3e0d'),
        email: 'test@example.com',
        password: '',
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system'
      },
      _orgId: '67e8e19b149f740323af93d7'
    };
  });
  
  // Clean up MongoDB Memory Server after all tests
  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });
  
  // Set up service before each test
  beforeEach(async () => {
    // Create a clean collection for each test
    if (collection) {
      await collection.drop().catch(() => {
        // Ignore errors if collection doesn't exist yet
      });
    }
    collection = db.collection('testEntities');
  });
  
  // Clean up after each test
  afterEach(async () => {
    // Additional cleanup if needed
  });
  
  describe('CRUD Operations', () => {
    it('should create and retrieve an entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Test Entity',
        description: 'This is a test entity',
        isActive: true
      };
      
      // Act
      const createdEntity = await service.create(userContext, testEntity as TestEntity);

      const retrievedEntity = await service.getById(userContext, createdEntity!._id.toString());
      
      // Assert
      expect(createdEntity).toBeDefined();
      expect(createdEntity!.name).toBe(testEntity.name);
      expect(createdEntity!.description).toBe(testEntity.description);
      expect(createdEntity!.isActive).toBe(testEntity.isActive);
      
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._id).toBeDefined();
      expect(retrievedEntity.name).toBe(testEntity.name);
      expect(retrievedEntity.description).toBe(testEntity.description);
      expect(retrievedEntity.isActive).toBe(testEntity.isActive);
    });
    
    it('should create multiple entities and retrieve them all', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: TestEntity[] = [
        { name: 'Entity 1', isActive: true } as TestEntity,
        { name: 'Entity 2', isActive: false } as TestEntity,
        { name: 'Entity 3', isActive: true } as TestEntity
      ];
      
      // Act
      const createdEntities = await service.createMany(userContext, testEntities);
      const allEntities = await service.getAll(userContext);
      
      // Assert
      expect(createdEntities).toHaveLength(3);
      expect(allEntities).toHaveLength(3);
      
      // Check if all entities are present
      const entityNames = allEntities.map(e => e.name).sort();
      expect(entityNames).toEqual(['Entity 1', 'Entity 2', 'Entity 3']);
    });
    
    it('should update an entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Initial Name',
        description: 'Initial description',
        isActive: true
      };
      
      // Create the entity first
      const createdEntity = await service.create(userContext, initialEntity as TestEntity);
      
      // Act - Update the entity
      const updateData: Partial<TestEntity> = {
        name: 'Updated Name',
        description: 'Updated description'
      };
      
      const updatedEntity = await service.partialUpdateById(
        userContext, 
        createdEntity!._id.toString(), 
        updateData
      );
      
      // Assert
      expect(updatedEntity).toBeDefined();
      expect(updatedEntity.name).toBe('Updated Name');
      expect(updatedEntity.description).toBe('Updated description');
      expect(updatedEntity.isActive).toBe(true); // Should remain unchanged
    });
    
    it('should delete an entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Entity to Delete',
        isActive: true
      };
      
      // Create the entity first
      const createdEntity = await service.create(userContext, testEntity as TestEntity);
      
      // Act
      const deleteResult = await service.deleteById(
        userContext, 
        createdEntity!._id.toString()
      );
      
      // Assert
      expect(deleteResult.deletedCount).toBe(1);
      
      // Verify the entity is deleted by trying to retrieve it
      await expect(service.getById(
        userContext, 
        createdEntity!._id.toString()
      )).rejects.toThrow(IdNotFoundError);
    });
  });
  
  describe('Query Operations', () => {
    // Create test data
    beforeEach(async () => {
      const userContext = createUserContext();
      const testEntities: TestEntity[] = [
        { name: 'Entity A', tags: ['tag1', 'tag2'], count: 10, isActive: true } as TestEntity,
        { name: 'Entity B', tags: ['tag2', 'tag3'], count: 20, isActive: false } as TestEntity,
        { name: 'Entity C', tags: ['tag1', 'tag3'], count: 30, isActive: true } as TestEntity,
        { name: 'Entity D', tags: ['tag4'], count: 40, isActive: false } as TestEntity,
        { name: 'Entity E', tags: ['tag1', 'tag4'], count: 50, isActive: true } as TestEntity
      ];
      
      await service.createMany(userContext, testEntities);
    });
    
    it('should get all entities', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Act
      const results = await service.getAll(userContext);
      
      // Assert
      expect(results).toHaveLength(5);
    });
    
    it('should get entities with pagination', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions = new QueryOptions();
      queryOptions.page = 1;
      queryOptions.pageSize = 2;
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(2);
      expect(pagedResult.total).toBe(5);
      expect(pagedResult.page).toBe(1);
      expect(pagedResult.pageSize).toBe(2);
      expect(pagedResult.totalPages).toBe(3);
    });
    
    it('should get entities with sorting', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions = new QueryOptions();
      queryOptions.orderBy = 'name';
      queryOptions.sortDirection = 'desc';
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(5);
      expect(pagedResult.entities![0].name).toBe('Entity E');
      expect(pagedResult.entities![1].name).toBe('Entity D');
      expect(pagedResult.entities![2].name).toBe('Entity C');
    });
    
    it('should get entities with filtering', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions = new QueryOptions();
      queryOptions.filters = {
        isActive: { eq: true }
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(3);
      expect(pagedResult.entities!.every(e => e.isActive === true)).toBe(true);
    });
    
    it('should find entities matching a query', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Act
      const results = await service.find(userContext, { count: { $gt: 30 } });
      
      // Assert
      expect(results).toHaveLength(2);
      expect(results.some(e => e.name === 'Entity D')).toBe(true);
      expect(results.some(e => e.name === 'Entity E')).toBe(true);
    });
  });
  
  describe('Validation', () => {
    it('should reject an entity that fails validation', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidEntity: Partial<TestEntity> = {
        // Missing required 'name' field
        description: 'This entity is invalid'
      };
      
      // Act & Assert
      await expect(
        service.create(userContext, invalidEntity as TestEntity)
      ).rejects.toThrow();
    });
    
    it('should accept a valid entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const validEntity: Partial<TestEntity> = {
        name: 'Valid Entity'
      };
      
      // Act
      const result = await service.create(userContext, validEntity as TestEntity);
      
      // Assert
      expect(result).toBeDefined();
      expect(result!.name).toBe('Valid Entity');
    });
    
    it('should accept a partial update with only some fields', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Initial Entity',
        description: 'Initial description',
        isActive: true
      };
      
      // Create the entity first
      const createdEntity = await service.create(userContext, initialEntity as TestEntity);
      
      // Act - Only update description
      const updateData: Partial<TestEntity> = {
        description: 'Updated description only'
      };
      
      const updatedEntity = await service.partialUpdateById(
        userContext, 
        createdEntity!._id.toString(), 
        updateData
      );
      
      // Assert
      expect(updatedEntity).toBeDefined();
      expect(updatedEntity.name).toBe('Initial Entity'); // Unchanged
      expect(updatedEntity.description).toBe('Updated description only');
      expect(updatedEntity.isActive).toBe(true); // Unchanged
    });
    
    it('should strip properties not defined in the schema while preserving system properties', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create an entity with an extra property not defined in the schema
      const testEntity: any = {
        name: 'Entity with extra props',
        extraProperty: 'This property is not in the schema',
        anotherExtraProperty: 42,
        nestedExtra: { foo: 'bar' }
      };
      
      // Act
      const createdEntity = await service.create(userContext, testEntity as TestEntity);
      const retrievedEntity = await service.getById(userContext, createdEntity!._id.toString());
      
      // Assert
      expect(createdEntity).toBeDefined();
      expect(createdEntity!.name).toBe(testEntity.name);
      
      // Check that extra properties were stripped out
      expect((createdEntity as any).extraProperty).toBeUndefined();
      expect((createdEntity as any).anotherExtraProperty).toBeUndefined();
      expect((createdEntity as any).nestedExtra).toBeUndefined();
      
      // Check that they're also not present when retrieving
      expect((retrievedEntity as any).extraProperty).toBeUndefined();
      expect((retrievedEntity as any).anotherExtraProperty).toBeUndefined();
      expect((retrievedEntity as any).nestedExtra).toBeUndefined();
      
      // Check that system properties were preserved
      expect(retrievedEntity._id).toBeDefined();
      if (entityUtils.isAuditable(retrievedEntity)) {
        expect((retrievedEntity as any)._created).toBeDefined();
        expect((retrievedEntity as any)._createdBy).toBeDefined();
        expect((retrievedEntity as any)._updated).toBeDefined();
        expect((retrievedEntity as any)._updatedBy).toBeDefined();
      }
    });
  });
  
  describe('Error Handling', () => {
    it('should throw IdNotFoundError when getting non-existent entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const nonExistentId = new ObjectId().toString();
      
      // Act & Assert
      await expect(
        service.getById(userContext, nonExistentId)
      ).rejects.toThrow(IdNotFoundError);
    });
    
    it('should throw BadRequestError when providing invalid ObjectId', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidId = 'not-an-object-id';
      
      // Act & Assert
      await expect(
        service.getById(userContext, invalidId)
      ).rejects.toThrow(BadRequestError);
    });
    
    it('should throw DuplicateKeyError when creating entity with duplicate unique key', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // First, create a collection with a unique index
      await collection.createIndex({ name: 1 }, { unique: true });
      
      // Create first entity
      const entity1: Partial<TestEntity> = {
        name: 'Unique Name'
      };
      await service.create(userContext, entity1 as TestEntity);
      
      // Try to create second entity with same name
      const entity2: Partial<TestEntity> = {
        name: 'Unique Name'
      };
      
      // Act & Assert
      await expect(
        service.create(userContext, entity2 as TestEntity)
      ).rejects.toThrow(DuplicateKeyError);
    });
  });
  
  describe('auditable functionality', () => {
    it('should add all auditable properties on creation when model is auditable', async () => {
      // Arrange
      const entity: Partial<TestEntity> = { name: 'AuditTest' };
      
      // Act
      const result = await service.create(mockUserContext, entity as TestEntity);
      
      // Assert
      expect(result).not.toBeNull();
      if (result) {
        expect(result._created).toBeDefined();
        expect(result._createdBy).toBe(mockUserContext.user._id.toString());
        expect(result._updated).toBeDefined();
        expect(result._updatedBy).toBe(mockUserContext.user._id.toString());
      }
    });

    it('should not add auditable properties when model is not auditable', async () => {
      // Create a non-auditable service
      const nonAuditableModelSpec = entityUtils.getModelSpec(TestEntitySchema, { isAuditable: false });
      const nonAuditableService = new GenericApiService<TestEntity>(
        db,
        'testEntities',
        'testEntity',
        nonAuditableModelSpec
      );
      
      // Arrange
      const entity: Partial<TestEntity> = { name: 'NonAuditTest' };
      
      // Act
      const result = await nonAuditableService.create(mockUserContext, entity as TestEntity);
      
      // Assert
      expect(result).not.toBeNull();
      if (result) {
        // @ts-ignore - We're checking for the absence of these properties
        expect(result._created).toBeUndefined();
        // @ts-ignore
        expect(result._createdBy).toBeUndefined();
        // @ts-ignore
        expect(result._updated).toBeUndefined();
        // @ts-ignore
        expect(result._updatedBy).toBeUndefined();
      }
    });

    it('should update _updated and _updatedBy on update but preserve _created and _createdBy', async () => {
      // First create an entity
      const entity: Partial<TestEntity> = { name: 'UpdateTest' };
      const createdEntity = await service.create(mockUserContext, entity as TestEntity);
      expect(createdEntity).not.toBeNull();
      
      if (createdEntity) {
        const originalCreated = createdEntity._created;
        const originalCreatedBy = createdEntity._createdBy;
        
        // Create a new user context for the update
        const updaterUserContext: IUserContext = {
          user: {
            _id: new ObjectId('5f7d5dc35a3a3a0b8c7b3e0e'),
            email: 'updater@example.com',
            password: '',
            _created: new Date(),
            _createdBy: 'system',
            _updated: new Date(),
            _updatedBy: 'system'
          },
          _orgId: '67e8e19b149f740323af93d7'
        };
        
        // Wait a moment to ensure timestamps differ
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Update the entity
        const updatedEntity = await service.partialUpdateById(
          updaterUserContext, 
          createdEntity._id.toString(), 
          { name: 'Updated Test' }
        );
        
        // Check audit fields
        expect(updatedEntity._created).toEqual(createdEntity._created);
        expect(updatedEntity._createdBy).toEqual(createdEntity._createdBy);
        expect(updatedEntity._updated).not.toEqual(createdEntity._updated);
        expect(updatedEntity._updatedBy).toEqual(updaterUserContext.user._id.toString());
        
        // Verify that the original created values were preserved
        expect(updatedEntity._created).toEqual(originalCreated);
        expect(updatedEntity._createdBy).toEqual(originalCreatedBy);
      }
    });

    it('should not allow client to override audit properties on create', async () => {
      const hackDate = moment().subtract(1, 'year').toDate();
      
      // TypeScript will complain about these properties, but we're explicitly testing to ensure
      // they are ignored by the API service
      const entity = { 
        name: 'TamperTest',
        _created: hackDate,
        _createdBy: 'hacker',
        _updated: hackDate,
        _updatedBy: 'hacker'
      } as any; // Use 'any' to bypass TypeScript checks on purpose
      
      const result = await service.create(mockUserContext, entity);
      
      expect(result).not.toBeNull();
      if (result) {
        expect(result._created).not.toEqual(hackDate);
        expect(result._createdBy).not.toEqual('hacker');
        expect(result._updated).not.toEqual(hackDate);
        expect(result._updatedBy).not.toEqual('hacker');
        expect(result._createdBy).toEqual(mockUserContext.user._id.toString());
      }
    });

    it('should not allow client to override audit properties on update', async () => {
      // First create an entity
      const entity: Partial<TestEntity> = { name: 'TamperUpdateTest' };
      const createdEntity = await service.create(mockUserContext, entity as TestEntity);
      expect(createdEntity).not.toBeNull();
      
      if (createdEntity) {
        // Wait a moment to ensure timestamps differ
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try to tamper with audit properties during update
        const hackDate = moment().subtract(1, 'year').toDate();
        
        // Use 'any' to bypass TypeScript checks for audit properties
        const tamperedUpdate = {
          name: 'Updated Name',
          _created: hackDate,
          _createdBy: 'hacker',
          _updated: hackDate,
          _updatedBy: 'hacker'
        } as any;
        
        const updatedEntity = await service.partialUpdateById(
          mockUserContext,
          createdEntity._id.toString(),
          tamperedUpdate
        );
        
        // Verify audit properties were not tampered with
        expect(updatedEntity._created).toEqual(createdEntity._created);
        expect(updatedEntity._createdBy).toEqual(createdEntity._createdBy);
        expect(updatedEntity._updated).not.toEqual(createdEntity._updated); // Should be updated with current timestamp
        expect(updatedEntity._updatedBy).toEqual(mockUserContext.user._id.toString());
      }
    });

    it('should handle system updates without a user context', async () => {
      // Create with user context
      const entity: Partial<TestEntity> = { name: 'SystemUpdateTest' };
      const createdEntity = await service.create(mockUserContext, entity as TestEntity);
      expect(createdEntity).not.toBeNull();
      
      if (createdEntity) {
        // Update without user context (system update)
        const updatedEntity = await service.partialUpdateById(
          EmptyUserContext, 
          createdEntity._id.toString(),
          { name: 'System Updated' }
        );
        
        // Verify system is recorded as updater
        expect(updatedEntity._updated).toBeDefined();
        expect(updatedEntity._updatedBy).toEqual('system');
        expect(updatedEntity._created).toEqual(createdEntity._created);
        expect(updatedEntity._createdBy).toEqual(createdEntity._createdBy);
      }
    });
  });
  
  describe('Type Conversion', () => {
    it('should convert string IDs to ObjectIds based on schema definition', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create a schema with refId defined as ObjectId type
      const ObjectIdSchema = Type.Object({
        name: Type.String({ minLength: 1 }),
        // Use TypeboxObjectId for proper transformation
        refId: TypeboxObjectId({ title: 'Reference ID' })
      });
      
      const objectIdModelSpec = entityUtils.getModelSpec(ObjectIdSchema, { isAuditable: true });
      
      // Create a service with this schema
      const objectIdService = new GenericApiService<any>(
        db,
        'objectIdToStringTest',
        'objectIdEntity',
        objectIdModelSpec
      );
      
      // Create an entity with a string ID (simulating JSON from API)
      const stringIdEntity = {
        name: 'Entity with string ID reference',
        refId: new ObjectId().toString() // String ID from client
      };
      
      // Act - Create the entity through the service
      const createdEntity = await objectIdService.create(userContext, stringIdEntity);
      
      // Retrieve the entity
      const retrievedEntity = await objectIdService.getById(userContext, createdEntity!._id.toString());
      
      // Assert - the refId should be converted to an ObjectId by the schema
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity.refId).toBeDefined();
      expect(retrievedEntity.refId instanceof ObjectId).toBe(true);
      expect(retrievedEntity.refId.toString()).toBe(stringIdEntity.refId);
    });
    
    it('should convert ISO date strings to Date objects based on schema definition', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create a test date and its ISO string representation
      const testDate = new Date();
      const isoDateString = testDate.toISOString();
      
      // Create a schema with eventDate defined as Date type
      const DateSchema = Type.Object({
        name: Type.String({ minLength: 1 }),
        eventDate: TypeboxIsoDate({ title: 'Event Date' })
      });
      
      const dateModelSpec = entityUtils.getModelSpec(DateSchema, { isAuditable: true });
      
      // Create a service with this schema
      const dateService = new GenericApiService<any>(
        db,
        'dateEntities',
        'dateEntity',
        dateModelSpec
      );
      
      // Create entity with a date as string (simulating JSON from API)
      const entityWithDateString = {
        name: 'Entity with date string',
        eventDate: isoDateString // ISO date string from API
      };
      
      // Act - Create the entity through the service
      const createdEntity = await dateService.create(userContext, entityWithDateString);
      
      // Retrieve the entity
      const retrievedEntity = await dateService.getById(userContext, createdEntity!._id.toString());
      
      // Assert - the eventDate should be converted to a Date object by the schema
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity.eventDate).toBeDefined();
      expect(retrievedEntity.eventDate instanceof Date).toBe(true);
      expect(retrievedEntity.eventDate.toISOString()).toBe(isoDateString);
    });
    
    it('should handle nested objects with ObjectIds and Dates based on schema definition', async () => {
      // Arrange
      const userContext = createUserContext();
      const testDate = new Date();
      const refId = new ObjectId();
      
      // Create a schema for a complex entity with nested objects
      const ComplexSchema = Type.Object({
        name: Type.String(),
        nested: Type.Object({
          refId: TypeboxObjectId({ title: 'Reference ID' }), // Using TypeboxObjectId for proper transformation
          timestamp: TypeboxIsoDate({ title: 'Timestamp' }), // Using TypeboxIsoDate for proper transformation
          deeplyNested: Type.Object({
            anotherRefId: TypeboxObjectId({ title: 'Another Reference ID' })
          })
        }),
        items: Type.Array(
          Type.Object({
            itemRefId: TypeboxObjectId({ title: 'Item Reference ID' }),
            created: TypeboxIsoDate({ title: 'Created Date' })
          })
        )
      });
      
      const complexModelSpec = entityUtils.getModelSpec(ComplexSchema);
      
      // Create a service with this schema
      const complexService = new GenericApiService<any>(
        db,
        'complexEntities',
        'complexEntity',
        complexModelSpec
      );
      
      // Create an entity with nested objects containing string IDs and ISO date strings (simulating JSON from API)
      const complexJsonEntity = {
        name: 'Complex Entity',
        nested: {
          refId: refId.toString(), // String ID from client
          timestamp: testDate.toISOString(), // ISO date string from client
          deeplyNested: {
            anotherRefId: refId.toString() // String ID from client
          }
        },
        items: [
          { itemRefId: refId.toString(), created: testDate.toISOString() },
          { itemRefId: new ObjectId().toString(), created: new Date().toISOString() }
        ]
      };
      
      // Act - Create the entity through the service
      const createdEntity = await complexService.create(userContext, complexJsonEntity);
      
      // Retrieve the entity
      const retrievedEntity = await complexService.getById(userContext, createdEntity!._id.toString());
      
      // Assert - check that all string IDs and ISO date strings were converted to their proper types
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity.nested.refId instanceof ObjectId).toBe(true);
      expect(retrievedEntity.nested.timestamp instanceof Date).toBe(true);
      expect(retrievedEntity.nested.deeplyNested.anotherRefId instanceof ObjectId).toBe(true);
      expect(retrievedEntity.items[0].itemRefId instanceof ObjectId).toBe(true);
      expect(retrievedEntity.items[0].created instanceof Date).toBe(true);
      expect(retrievedEntity.items[1].itemRefId instanceof ObjectId).toBe(true);
      expect(retrievedEntity.items[1].created instanceof Date).toBe(true);
      
      // Verify the values match the original input
      expect(retrievedEntity.nested.refId.toString()).toBe(refId.toString());
      expect(retrievedEntity.nested.timestamp.toISOString()).toBe(testDate.toISOString());
      expect(retrievedEntity.nested.deeplyNested.anotherRefId.toString()).toBe(refId.toString());
    });
  });
}); 
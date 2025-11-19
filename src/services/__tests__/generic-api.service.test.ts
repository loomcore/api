import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import moment from 'moment';
import { IUserContext, IQueryOptions, DefaultQueryOptions, IEntity, IAuditable, EmptyUserContext } from '@loomcore/common/models';
import { TypeboxIsoDate, TypeboxObjectId, initializeTypeBox } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';

import { IdNotFoundError, DuplicateKeyError, BadRequestError } from '../../errors/index.js';
import { GenericApiService } from '../generic-api-service/generic-api.service.js';

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
    _id: new ObjectId().toString(),
    email: 'test@example.com',
    password: '',
    _created: new Date(),
    _createdBy: 'system',
    _updated: new Date(),
    _updatedBy: 'system'
  },
  _orgId: '67e8e19b149f740323af93d7'
});

describe('GenericApiService - Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let service: GenericApiService<TestEntity>;
  let collection: Collection;
  let testUserContext: IUserContext;
  
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
    
    testUserContext = {
      user: {
        _id: new ObjectId('5f7d5dc35a3a3a0b8c7b3e0d').toString(),
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
      const createdEntity = await service.create(userContext, testEntity);
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
      const createdEntity = await service.create(userContext, initialEntity);
      
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
      const createdEntity = await service.create(userContext, testEntity);
      
      // Act
      const deleteResult = await service.deleteById(
        userContext, 
        createdEntity!._id.toString()
      );
      
      // Assert
      expect(deleteResult.count).toBe(1);
      expect(deleteResult.success).toBe(true);
      
      // Verify the entity is deleted by trying to retrieve it
      await expect(service.getById(
        userContext, 
        createdEntity!._id.toString()
      )).rejects.toThrow(IdNotFoundError);
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
      const createdEntity = await service.create(userContext, initialEntity);
      
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
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        page: 1,
        pageSize: 2
      };
      
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
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        orderBy: 'name',
        sortDirection: 'desc'
      };
      
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
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          isActive: { eq: true }
        }
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(3);
      expect(pagedResult.entities!.every((e: TestEntity) => e.isActive === true)).toBe(true);
    });
    
    it('should find entities matching a query', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Act
      const results = await service.find(userContext, { filters: { count: { gt: 30 } } });
      
      // Assert
      expect(results).toHaveLength(2);
      expect(results.some(e => e.name === 'Entity D')).toBe(true);
      expect(results.some(e => e.name === 'Entity E')).toBe(true);
    });
  });
  
  describe('Validation Methods', () => {
    it('should validate and return errors for invalid entity', () => {
      // Arrange
      const invalidEntity = {
        // Missing required 'name' field
        description: 'This entity is invalid'
      };
      
      // Act
      const validationErrors = service.validate(invalidEntity);
      
      // Assert
      expect(validationErrors).not.toBeNull();
      expect(validationErrors!.length).toBeGreaterThan(0);
      expect(validationErrors!.some(error => error.path === '/name')).toBe(true);
    });
    
    it('should validate and return null for valid entity', () => {
      // Arrange
      const validEntity = {
        name: 'Valid Entity',
        description: 'This is valid',
        isActive: true
      };
      
      // Act
      const validationErrors = service.validate(validEntity);
      
      // Assert
      expect(validationErrors).toBeNull();
    });
    
    it('should validate partial entity for updates', () => {
      // Arrange
      const partialEntity = {
        description: 'Updated description'
        // name is not required for partial updates
      };
      
      // Act
      const validationErrors = service.validate(partialEntity, true);
      
      // Assert
      expect(validationErrors).toBeNull();
    });
    
    it('should validate multiple entities', () => {
      // Arrange
      const entities = [
        { name: 'Valid Entity 1' },
        { description: 'Invalid - missing name' }, // Invalid
        { name: 'Valid Entity 2' }
      ];
      
      // Act
      const validationErrors = service.validateMany(entities);
      
      // Assert
      expect(validationErrors).not.toBeNull();
      expect(validationErrors!.length).toBeGreaterThan(0);
    });
    
    it('should return null when all entities in array are valid', () => {
      // Arrange
      const entities = [
        { name: 'Valid Entity 1' },
        { name: 'Valid Entity 2' }
      ];
      
      // Act
      const validationErrors = service.validateMany(entities);
      
      // Assert
      expect(validationErrors).toBeNull();
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
      
      await service.create(userContext, entity1);
      
      // Try to create second entity with same name
      const entity2: Partial<TestEntity> = {
        name: 'Unique Name'
      };
      
      // Act & Assert
      await expect(
        service.create(userContext, entity2)
      ).rejects.toThrow(DuplicateKeyError);
    });
  });
  
  describe('Data Preparation', () => {
    describe('Basic Preparation', () => {
      it('should strip properties not defined in the schema', async () => {
        // Arrange
        const userContext = createUserContext();
        const entityWithExtraProps: any = {
          name: 'Entity with extra props',
          extraProperty: 'This property is not in the schema',
          anotherExtraProperty: 42,
          nestedExtra: { foo: 'bar' }
        };
        
        // Act
        const preparedEntity = await service.prepareEntity(userContext, entityWithExtraProps, true);
        
        // Assert
        expect(preparedEntity.name).toBe('Entity with extra props');
        expect((preparedEntity as any).extraProperty).toBeUndefined();
        expect((preparedEntity as any).anotherExtraProperty).toBeUndefined();
        expect((preparedEntity as any).nestedExtra).toBeUndefined();
      });
      
      it('should preserve valid properties defined in the schema', async () => {
        // Arrange
        const userContext = createUserContext();
        const validEntity = {
          name: 'Valid Entity',
          description: 'Valid description',
          isActive: true,
          tags: ['tag1', 'tag2'],
          count: 42
        };
        
        // Act
        const preparedEntity = await service.prepareEntity(userContext, validEntity, true);
        
        // Assert
        expect(preparedEntity.name).toBe(validEntity.name);
        expect(preparedEntity.description).toBe(validEntity.description);
        expect(preparedEntity.isActive).toBe(validEntity.isActive);
        expect(preparedEntity.tags).toEqual(validEntity.tags);
        expect(preparedEntity.count).toBe(validEntity.count);
      });
    });
    
    describe('prepareDataForDb', () => {
      it('should add audit properties on creation when model is auditable', async () => {
        // Arrange
        const entity = { name: 'AuditTest' };
        
        // Act
        const preparedEntity = await service.prepareEntity<Partial<TestEntity>>(testUserContext, entity, true);
        
        // Assert
        expect(preparedEntity._created).toBeDefined();
        expect(preparedEntity._createdBy).toBe(testUserContext.user._id.toString());
        expect(preparedEntity._updated).toBeDefined();
        expect(preparedEntity._updatedBy).toBe(testUserContext.user._id.toString());
      });

      it('should not add audit properties when model is not auditable', async () => {
        // Create a non-auditable service
        const nonAuditableModelSpec = entityUtils.getModelSpec(TestEntitySchema, { isAuditable: false });
        const nonAuditableService = new GenericApiService<TestEntity>(
          db,
          'testEntities',
          'testEntity',
          nonAuditableModelSpec
        );
        
        // Arrange
        const entity = { name: 'NonAuditTest' };
        
        // Act
        const preparedEntity = await nonAuditableService.prepareEntity<Partial<TestEntity>>(testUserContext, entity, true);
        
        // Assert
        expect((preparedEntity as any)._created).toBeUndefined();
        expect((preparedEntity as any)._createdBy).toBeUndefined();
        expect((preparedEntity as any)._updated).toBeUndefined();
        expect((preparedEntity as any)._updatedBy).toBeUndefined();
      });

      it('should add update audit properties for updates', async () => {
        // Arrange
        const updateData = { name: 'Updated Test' };
        const updaterUserContext: IUserContext = {
          user: {
            _id: new ObjectId('5f7d5dc35a3a3a0b8c7b3e0e').toString(),
            email: 'updater@example.com',
            password: '',
            _created: new Date(),
            _createdBy: 'system',
            _updated: new Date(),
            _updatedBy: 'system'
          },
          _orgId: '67e8e19b149f740323af93d7'
        };
        
        // Act
        const preparedEntity = await service.prepareEntity<Partial<TestEntity>>(updaterUserContext, updateData, false);
        
        // Assert
        expect(preparedEntity._updated).toBeDefined();
        expect(preparedEntity._updatedBy).toBe(updaterUserContext.user._id.toString());
        // Should not have creation audit properties for updates
        expect(preparedEntity._created).toBeUndefined();
        expect(preparedEntity._createdBy).toBeUndefined();
      });

      it('should strip client-provided audit properties on create', async () => {
        // Arrange
        const hackDate = moment().subtract(1, 'year').toDate();
        const entityWithHackedAudit = { 
          name: 'TamperTest',
          _created: hackDate,
          _createdBy: 'hacker',
          _updated: hackDate,
          _updatedBy: 'hacker'
        };
        
        // Act
        const preparedEntity = await service.prepareEntity<Partial<TestEntity>>(testUserContext, entityWithHackedAudit, true);
        
        // Assert
        expect(preparedEntity._created).not.toEqual(hackDate);
        expect(preparedEntity._createdBy).not.toEqual('hacker');
        expect(preparedEntity._updated).not.toEqual(hackDate);
        expect(preparedEntity._updatedBy).not.toEqual('hacker');
        expect(preparedEntity._createdBy).toEqual(testUserContext.user._id.toString());
      });

      it('should strip client-provided audit properties on update', async () => {
        // Arrange
        const hackDate = moment().subtract(1, 'year').toDate();
        const tamperedUpdate = {
          name: 'Updated Name',
          _created: hackDate,
          _createdBy: 'hacker',
          _updated: hackDate,
          _updatedBy: 'hacker'
        };
        
        // Act
        const preparedEntity = await service.prepareEntity<Partial<TestEntity>>(testUserContext, tamperedUpdate, false);
        
        // Assert
        expect(preparedEntity.name).toBe('Updated Name'); // Valid property preserved
        expect(preparedEntity._created).toBeUndefined(); // Stripped (shouldn't be in updates anyway)
        expect(preparedEntity._createdBy).toBeUndefined(); // Stripped
        expect(preparedEntity._updated).not.toEqual(hackDate); // Should be current timestamp
        expect(preparedEntity._updatedBy).toEqual(testUserContext.user._id.toString()); // Should be real user
      });

      it('should handle system updates', async () => {
        // Arrange
        const updateData = { name: 'System Updated' };
        
        // Act
        const preparedEntity = await service.prepareEntity<Partial<TestEntity>>(EmptyUserContext, updateData, false);
        
        // Assert
        expect(preparedEntity._updated).toBeDefined();
        expect(preparedEntity._updatedBy).toEqual('system');
      });
    });
    
    describe('Type Conversion', () => {
      it('should convert ISO date strings to Date objects', async () => {
        // Arrange
        const userContext = createUserContext();
        const testDate = new Date();
        const isoDateString = testDate.toISOString();
        
        // Create a schema with eventDate defined as Date type
        const DateSchema = Type.Object({
          name: Type.String({ minLength: 1 }),
          eventDate: TypeboxIsoDate({ title: 'Event Date' })
        });
        
        const dateModelSpec = entityUtils.getModelSpec(DateSchema, { isAuditable: true });
        const dateService = new GenericApiService<any>(
          db,
          'dateEntities',
          'dateEntity',
          dateModelSpec
        );
        
        // Entity with date as string (simulating JSON from API)
        const entityWithDateString = {
          name: 'Entity with date string',
          eventDate: isoDateString // ISO date string from API
        };
        
        // Act
        const preparedEntity = await dateService.prepareEntity<any>(userContext, entityWithDateString, true);
        
        // Assert
        expect(preparedEntity.eventDate instanceof Date).toBe(true);
        expect(preparedEntity.eventDate.toISOString()).toBe(isoDateString);
      });
      
      it('should convert string IDs to ObjectIds for database storage', async () => {
        // Arrange
        const userContext = createUserContext();
        const ObjectIdSchema = Type.Object({
          name: Type.String({ minLength: 1 }),
          refId: TypeboxObjectId({ title: 'Reference ID' })
        });
        
        const objectIdModelSpec = entityUtils.getModelSpec(ObjectIdSchema, { isAuditable: true });
        const objectIdService = new GenericApiService<any>(
          db,
          'objectIdToStringTest',
          'objectIdEntity',
          objectIdModelSpec
        );
        
        // Entity with string ID (simulating JSON from API)
        const stringIdEntity = {
          name: 'Entity with string ID reference',
          refId: new ObjectId().toString() // String ID from client
        };
        
        // Act
        const preparedEntity = await objectIdService.prepareEntity<any>(userContext, stringIdEntity, true);
        
        // Assert - prepareDataForDb should convert string IDs to ObjectIds for database storage
        expect(preparedEntity.refId instanceof ObjectId).toBe(true);
        expect(preparedEntity.refId.toString()).toBe(stringIdEntity.refId);
      });
      
      it('should handle nested objects with proper type conversion to database types', async () => {
        // Arrange
        const userContext = createUserContext();
        const testDate = new Date();
        const refIdString = new ObjectId().toString();
        
        const ComplexSchema = Type.Object({
          name: Type.String(),
          nested: Type.Object({
            refId: TypeboxObjectId({ title: 'Reference ID' }),
            timestamp: TypeboxIsoDate({ title: 'Timestamp' }),
            deeplyNested: Type.Object({
              anotherRefId: TypeboxObjectId({ title: 'Another Reference ID' })
            })
          }),
          items: Type.Array(
            Type.Object({
              itemRefId: TypeboxObjectId({ title: 'Item Reference ID' }),
              eventDate: TypeboxIsoDate({ title: 'Event Date' })
            })
          )
        });
        
        const complexModelSpec = entityUtils.getModelSpec(ComplexSchema);
        const complexService = new GenericApiService<any>(
          db,
          'complexEntities',
          'complexEntity',
          complexModelSpec
        );
        
        // Entity with nested objects containing string IDs and ISO date strings
        const complexJsonEntity = {
          name: 'Complex Entity',
          nested: {
            refId: refIdString,
            timestamp: testDate.toISOString(),
            deeplyNested: {
              anotherRefId: refIdString
            }
          },
          items: [
            { itemRefId: refIdString, eventDate: testDate.toISOString() },
            { itemRefId: new ObjectId().toString(), eventDate: new Date().toISOString() }
          ]
        };
        
        // Act
        const preparedEntity = await complexService.prepareEntity<any>(userContext, complexJsonEntity, true);
        
        // Assert - prepareEntity should convert string IDs to ObjectIds for database storage
        expect(preparedEntity.nested.refId instanceof ObjectId).toBe(true);
        expect(preparedEntity.nested.deeplyNested.anotherRefId instanceof ObjectId).toBe(true);
        expect(preparedEntity.items[0].itemRefId instanceof ObjectId).toBe(true);
        expect(preparedEntity.items[1].itemRefId instanceof ObjectId).toBe(true);
        
        // Dates should be Date objects
        expect(preparedEntity.nested.timestamp instanceof Date).toBe(true);
        expect(preparedEntity.items[0].eventDate instanceof Date).toBe(true);
        expect(preparedEntity.items[1].eventDate instanceof Date).toBe(true);
        
        // Verify values match original input
        expect(preparedEntity.nested.refId.toString()).toBe(refIdString);
        expect(preparedEntity.nested.timestamp.toISOString()).toBe(testDate.toISOString());
        expect(preparedEntity.nested.deeplyNested.anotherRefId.toString()).toBe(refIdString);
      });
    });
  });
}); 
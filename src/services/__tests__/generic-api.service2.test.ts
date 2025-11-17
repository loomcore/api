import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IUserContext, IEntity, IAuditable, IQueryOptions, DefaultQueryOptions } from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';

import { DuplicateKeyError, BadRequestError, IdNotFoundError, NotFoundError } from '../../errors/index.js';
import { GenericApiService2 } from '../generic-api.service-v2.js';

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

describe('GenericApiService2 - Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let service: GenericApiService2<TestEntity>;
  let collection: Collection;
  
  // Set up MongoDB Memory Server before all tests
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test-db');
    
    // Create service with auditable model spec
    service = new GenericApiService2<TestEntity>(
      db,
      'testEntities',
      'testEntity',
      testModelSpec
    );
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
    it('should create an entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Test Entity',
        description: 'This is a test entity',
        isActive: true
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);

      // Act
      const createdEntity = await service.create(userContext, preparedEntity);
      
      // Assert
      expect(createdEntity).toBeDefined();
      expect(createdEntity!.name).toBe(testEntity.name);
      expect(createdEntity!.description).toBe(testEntity.description);
      expect(createdEntity!.isActive).toBe(testEntity.isActive);
    });
    
    it('should retrieve all entities', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: TestEntity[] = [
        { name: 'Entity 1', isActive: true } as TestEntity,
        { name: 'Entity 2', isActive: false } as TestEntity,
        { name: 'Entity 3', isActive: true } as TestEntity
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      // Act
      const createdEntities = await service.createMany(userContext, preparedEntities);

      const allEntities = await service.getAll(userContext);
      // Assert
      expect(allEntities).toHaveLength(3);
    });

    it('should have audit fields set', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Test Entity',
        description: 'This is a test entity',
        isActive: true
      };
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);

      if (!createdEntity) {
        throw new Error('Entity not created');
      }
      expect(createdEntity._created).toBeDefined();
      expect(createdEntity._createdBy).toBeDefined();
      expect(createdEntity._updated).toBeDefined();
      expect(createdEntity._updatedBy).toBeDefined();
    });

    it('should create multiple entities at once using createMany', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', description: 'First entity', isActive: true },
        { name: 'Entity 2', description: 'Second entity', isActive: false },
        { name: 'Entity 3', description: 'Third entity', isActive: true }
      ];
      
      // Prepare entities before creating
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      
      // Act
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Assert
      expect(createdEntities).toHaveLength(3);
      expect(createdEntities[0].name).toBe('Entity 1');
      expect(createdEntities[1].name).toBe('Entity 2');
      expect(createdEntities[2].name).toBe('Entity 3');
      
      // Verify all entities have IDs
      createdEntities.forEach(entity => {
        expect(entity._id).toBeDefined();
        expect(typeof entity._id).toBe('string');
      });
      
      // Verify audit fields are set (since model is auditable)
      createdEntities.forEach(entity => {
        expect(entity._created).toBeDefined();
        expect(entity._createdBy).toBeDefined();
        expect(entity._updated).toBeDefined();
        expect(entity._updatedBy).toBeDefined();
      });
    });

    it('should create multiple entities and retrieve them all using createMany', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Batch Entity 1', isActive: true },
        { name: 'Batch Entity 2', isActive: false },
        { name: 'Batch Entity 3', isActive: true }
      ];
      
      // Prepare entities before creating
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      
      // Act
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      const allEntities = await service.getAll(userContext);
      
      // Assert
      expect(createdEntities).toHaveLength(3);
      expect(allEntities).toHaveLength(3);
      
      // Check if all entities are present
      const entityNames = allEntities.map(e => e.name).sort();
      expect(entityNames).toEqual(['Batch Entity 1', 'Batch Entity 2', 'Batch Entity 3']);
    });

    it('should return empty array when createMany is called with empty array', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: TestEntity[] = [];
      
      // Act
      const createdEntities = await service.createMany(userContext, testEntities);
      
      // Assert
      expect(createdEntities).toHaveLength(0);
      expect(Array.isArray(createdEntities)).toBe(true);
    });

    it('should retrieve an entity by ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Test Entity for GetById',
        description: 'This entity will be retrieved by ID',
        isActive: true
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act
      const retrievedEntity = await service.getById(userContext, createdEntity._id);
      
      // Assert
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._id).toBe(createdEntity._id);
      expect(retrievedEntity.name).toBe(testEntity.name);
      expect(retrievedEntity.description).toBe(testEntity.description);
      expect(retrievedEntity.isActive).toBe(testEntity.isActive);
    });

    it('should retrieve entity by ID with all properties', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Complete Entity',
        description: 'Entity with all properties',
        isActive: true,
        tags: ['tag1', 'tag2', 'tag3'],
        count: 42
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act
      const retrievedEntity = await service.getById(userContext, createdEntity._id);
      
      // Assert
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._id).toBe(createdEntity._id);
      expect(retrievedEntity.name).toBe(testEntity.name);
      expect(retrievedEntity.description).toBe(testEntity.description);
      expect(retrievedEntity.isActive).toBe(testEntity.isActive);
      expect(retrievedEntity.tags).toEqual(testEntity.tags);
      expect(retrievedEntity.count).toBe(testEntity.count);
    });

    it('should transform entity ID from ObjectId to string when retrieving by ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Entity for ID transformation test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act
      const retrievedEntity = await service.getById(userContext, createdEntity._id);
      
      // Assert
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._id).toBeDefined();
      // ID should be a string (transformed from ObjectId)
      expect(typeof retrievedEntity._id).toBe('string');
      expect(retrievedEntity._id).toBe(createdEntity._id);
    });

    it('should retrieve correct entity when multiple entities exist', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', description: 'First entity' },
        { name: 'Entity 2', description: 'Second entity' },
        { name: 'Entity 3', description: 'Third entity' }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      if (createdEntities.length < 2 || !createdEntities[1]._id) {
        throw new Error('Entities not created properly');
      }
      
      const targetId = createdEntities[1]._id;
      
      // Act
      const retrievedEntity = await service.getById(userContext, targetId);
      
      // Assert
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._id).toBe(targetId);
      expect(retrievedEntity.name).toBe('Entity 2');
      expect(retrievedEntity.description).toBe('Second entity');
    });

    it('should preserve audit fields when retrieving entity by ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Entity with audit fields'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Verify audit fields are set on creation
      expect(createdEntity._created).toBeDefined();
      expect(createdEntity._createdBy).toBeDefined();
      expect(createdEntity._updated).toBeDefined();
      expect(createdEntity._updatedBy).toBeDefined();
      
      // Act
      const retrievedEntity = await service.getById(userContext, createdEntity._id);
      
      // Assert
      expect(retrievedEntity).toBeDefined();
      expect(retrievedEntity._created).toBeDefined();
      expect(retrievedEntity._createdBy).toBeDefined();
      expect(retrievedEntity._updated).toBeDefined();
      expect(retrievedEntity._updatedBy).toBeDefined();
      // Audit fields should match the created entity
      expect(retrievedEntity._created).toEqual(createdEntity._created);
      expect(retrievedEntity._createdBy).toBe(createdEntity._createdBy);
    });
  });
  
  describe('Error Handling', () => {
    it('should throw BadRequestError when getById is called with invalid ObjectId', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidId = 'invalid-object-id';
      
      // Act & Assert
      await expect(
        service.getById(userContext, invalidId)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when getById is called with empty string', async () => {
      // Arrange
      const userContext = createUserContext();
      const emptyId = '';
      
      // Act & Assert
      await expect(
        service.getById(userContext, emptyId)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError when getById is called with non-hexadecimal string', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidId = '12345678901234567890123g'; // 'g' is not a valid hex character
      
      // Act & Assert
      await expect(
        service.getById(userContext, invalidId)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw IdNotFoundError when getById is called with non-existent ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const nonExistentId = new ObjectId().toString();
      
      // Act & Assert
      await expect(
        service.getById(userContext, nonExistentId)
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should throw IdNotFoundError when entity is deleted before retrieval', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Entity to be deleted'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Delete the entity directly from the collection
      await collection.deleteOne({ _id: new ObjectId(createdEntity._id) });
      
      // Act & Assert
      await expect(
        service.getById(userContext, createdEntity._id)
      ).rejects.toThrow(IdNotFoundError);
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

    it('should throw DuplicateKeyError when createMany includes duplicate unique key', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create a collection with a unique index
      await collection.createIndex({ name: 1 }, { unique: true });
      
      // Create first entity with unique name
      const entity1: Partial<TestEntity> = {
        name: 'Existing Unique Name'
      };
      await service.create(userContext, entity1);
      
      // Try to create multiple entities where one has duplicate name
      const testEntities: Partial<TestEntity>[] = [
        { name: 'New Entity 1' },
        { name: 'Existing Unique Name' }, // This should cause duplicate key error
        { name: 'New Entity 2' }
      ];
      
      // Prepare entities before creating
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      
      // Act & Assert
      await expect(
        service.createMany(userContext, preparedEntities as TestEntity[])
      ).rejects.toThrow(DuplicateKeyError);
    });

    it('should throw DuplicateKeyError when createMany includes duplicate names within the batch', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create a collection with a unique index
      await collection.createIndex({ name: 1 }, { unique: true });
      
      // Try to create multiple entities with duplicate names within the batch
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Duplicate Name' },
        { name: 'Duplicate Name' }, // Duplicate within the same batch
        { name: 'Other Entity' }
      ];
      
      // Prepare entities before creating
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      
      // Act & Assert
      await expect(
        service.createMany(userContext, preparedEntities as TestEntity[])
      ).rejects.toThrow(DuplicateKeyError);
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
    
    it('should validate multiple entities and return errors for invalid ones', () => {
      // Arrange
      const entities = [
        { name: 'Valid Entity 1' },
        { description: 'Invalid - missing name' }, // Invalid
        { name: 'Valid Entity 2' }
      ];
      
      // Act
      const validationErrors = service.validateMany(entities);
      
      // Assert
      if (!validationErrors) {
        throw new Error('Validation errors are null');
      }
      // Should have errors for the missing name and it not being a string
      expect(validationErrors.length).toBe(2);
      // Should have errors for the invalid entity
      expect(validationErrors.every(error => error.path === '/name')).toBe(true);
    });
    
    it('should return null when all entities in array are valid', () => {
      // Arrange
      const entities = [
        { name: 'Valid Entity 1' },
        { name: 'Valid Entity 2' },
        { name: 'Valid Entity 3', description: 'With description' }
      ];
      
      // Act
      const validationErrors = service.validateMany(entities);
      
      // Assert
      expect(validationErrors).toBeNull();
    });

    it('should validate multiple entities with partial validation', () => {
      // Arrange
      const entities = [
        { description: 'Partial update 1' }, // Valid for partial
        { isActive: false }, // Valid for partial
        { name: 'Full entity' } // Valid for partial
      ];
      
      // Act
      const validationErrors = service.validateMany(entities, true);
      
      // Assert
      expect(validationErrors).toBeNull();
    });

    it('should accumulate errors from multiple invalid entities', () => {
      // Arrange
      const entities = [
        { description: 'Invalid - missing name' }, // Invalid
        { name: 'Valid Entity' }, // Valid
        { description: 'Another invalid - missing name' }, // Invalid
        { name: '' } // Invalid - empty string doesn't meet minLength
      ];
      
      // Act
      const validationErrors = service.validateMany(entities);
      
      // Assert
      expect(validationErrors).not.toBeNull();
      expect(validationErrors!.length).toBeGreaterThan(0);
      // Should have multiple errors from the invalid entities
      const nameErrors = validationErrors!.filter(error => error.path === '/name');
      expect(nameErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Query Operations', () => {
    // Create test data
    beforeEach(async () => {
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Entity A', tags: ['tag1', 'tag2'], count: 10, isActive: true },
        { name: 'Entity B', tags: ['tag2', 'tag3'], count: 20, isActive: false },
        { name: 'Entity C', tags: ['tag1', 'tag3'], count: 30, isActive: true },
        { name: 'Entity D', tags: ['tag4'], count: 40, isActive: false },
        { name: 'Entity E', tags: ['tag1', 'tag4'], count: 50, isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
    });

    
    it('should get all entities with default query options', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Act
      const pagedResult = await service.get(userContext);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(5);
      expect(pagedResult.total).toBe(5);
      expect(pagedResult.page).toBeDefined();
      expect(pagedResult.pageSize).toBeDefined();
      expect(pagedResult.totalPages).toBeDefined();
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

    it('should get entities with pagination on second page', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        page: 2,
        pageSize: 2
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(2);
      expect(pagedResult.total).toBe(5);
      expect(pagedResult.page).toBe(2);
      expect(pagedResult.pageSize).toBe(2);
      expect(pagedResult.totalPages).toBe(3);
    });
    
    it('should get entities with sorting ascending', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        orderBy: 'name',
        sortDirection: 'asc'
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(5);
      expect(pagedResult.entities![0].name).toBe('Entity A');
      expect(pagedResult.entities![1].name).toBe('Entity B');
      expect(pagedResult.entities![2].name).toBe('Entity C');
    });
    
    it('should get entities with sorting descending', async () => {
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
    
    it('should get entities with filtering by boolean field', async () => {
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
      expect(pagedResult.total).toBe(3);
      expect(pagedResult.entities!.every((e: TestEntity) => e.isActive === true)).toBe(true);
    });

    it('should get entities with filtering by number field', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          count: { gte: 30 }
        }
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(3);
      expect(pagedResult.total).toBe(3);
      expect(pagedResult.entities!.every((e: TestEntity) => (e.count || 0) >= 30)).toBe(true);
    });

    it('should get entities with filtering by string field', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          name: { eq: 'Entity A' }
        }
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(1);
      expect(pagedResult.total).toBe(1);
      expect(pagedResult.entities![0].name).toBe('Entity A');
    });

    it('should get entities with combined filtering and pagination', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          isActive: { eq: true }
        },
        page: 1,
        pageSize: 2
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(2);
      expect(pagedResult.total).toBe(3); // Total matching the filter
      expect(pagedResult.page).toBe(1);
      expect(pagedResult.pageSize).toBe(2);
      expect(pagedResult.totalPages).toBe(2);
      expect(pagedResult.entities!.every((e: TestEntity) => e.isActive === true)).toBe(true);
    });

    it('should get entities with combined sorting and pagination', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        orderBy: 'name',
        sortDirection: 'desc',
        page: 1,
        pageSize: 2
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(2);
      expect(pagedResult.total).toBe(5);
      expect(pagedResult.entities![0].name).toBe('Entity E');
      expect(pagedResult.entities![1].name).toBe('Entity D');
    });

    it('should get entities with combined filtering, sorting, and pagination', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          isActive: { eq: true }
        },
        orderBy: 'count',
        sortDirection: 'desc',
        page: 1,
        pageSize: 2
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(2);
      expect(pagedResult.total).toBe(3);
      expect(pagedResult.entities!.every((e: TestEntity) => e.isActive === true)).toBe(true);
      // Should be sorted by count descending
      expect(pagedResult.entities![0].count).toBeGreaterThanOrEqual(pagedResult.entities![1].count || 0);
    });

    it('should return empty result when filter matches nothing', async () => {
      // Arrange
      const userContext = createUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: {
          name: { eq: 'Non-existent Entity' }
        }
      };
      
      // Act
      const pagedResult = await service.get(userContext, queryOptions);
      
      // Assert
      expect(pagedResult.entities).toBeDefined();
      expect(pagedResult.entities!.length).toBe(0);
      expect(pagedResult.total).toBe(0);
      expect(pagedResult.totalPages).toBe(0);
    });
  });

  describe('Count Operations', () => {
    it('should return count of zero when no entities exist', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Act
      const count = await service.getCount(userContext);
      
      // Assert
      expect(count).toBe(0);
    });

    it('should return correct count after creating entities', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Count Entity 1', isActive: true },
        { name: 'Count Entity 2', isActive: false },
        { name: 'Count Entity 3', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act
      const count = await service.getCount(userContext);
      
      // Assert
      expect(count).toBe(3);
    });

    it('should return count that matches getAll length', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Count Match Entity 1' },
        { name: 'Count Match Entity 2' },
        { name: 'Count Match Entity 3' },
        { name: 'Count Match Entity 4' },
        { name: 'Count Match Entity 5' }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act
      const count = await service.getCount(userContext);
      const allEntities = await service.getAll(userContext);
      
      // Assert
      expect(count).toBe(5);
      expect(allEntities.length).toBe(5);
      expect(count).toBe(allEntities.length);
    });

    it('should return correct count after creating single entity', async () => {
      // Arrange
      const userContext = createUserContext();
      const testEntity: Partial<TestEntity> = {
        name: 'Single Count Entity'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      await service.create(userContext, preparedEntity);
      
      // Act
      const count = await service.getCount(userContext);
      
      // Assert
      expect(count).toBe(1);
    });

    it('should return updated count after multiple create operations', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Initial count should be 0
      let count = await service.getCount(userContext);
      expect(count).toBe(0);
      
      // Create first entity
      const entity1: Partial<TestEntity> = { name: 'Entity 1' };
      const prepared1 = await service.prepareDataForDb(userContext, entity1, true);
      await service.create(userContext, prepared1);
      
      count = await service.getCount(userContext);
      expect(count).toBe(1);
      
      // Create second entity
      const entity2: Partial<TestEntity> = { name: 'Entity 2' };
      const prepared2 = await service.prepareDataForDb(userContext, entity2, true);
      await service.create(userContext, prepared2);
      
      count = await service.getCount(userContext);
      expect(count).toBe(2);
      
      // Create multiple entities at once
      const entities: Partial<TestEntity>[] = [
        { name: 'Entity 3' },
        { name: 'Entity 4' },
        { name: 'Entity 5' }
      ];
      const preparedEntities = await service.prepareDataForDb(userContext, entities, true);
      await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Final count should be 5
      count = await service.getCount(userContext);
      expect(count).toBe(5);
    });
  });

  describe('Batch Update Operations', () => {
    it('should update multiple entities at once using batchUpdate', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entities
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', description: 'Original description 1', isActive: true },
        { name: 'Entity 2', description: 'Original description 2', isActive: false },
        { name: 'Entity 3', description: 'Original description 3', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Prepare update entities with IDs
      const updateEntities: Partial<TestEntity>[] = [
        { _id: createdEntities[0]._id, description: 'Updated description 1', isActive: false },
        { _id: createdEntities[1]._id, description: 'Updated description 2', isActive: true },
        { _id: createdEntities[2]._id, description: 'Updated description 3', count: 100 }
      ];
      
      // Prepare entities for batch update
      const preparedUpdates = await service.prepareDataForBatchUpdate(userContext, updateEntities);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdates);
      
      // Assert
      expect(updatedEntities).toHaveLength(3);
      expect(updatedEntities[0].description).toBe('Updated description 1');
      expect(updatedEntities[0].isActive).toBe(false);
      expect(updatedEntities[1].description).toBe('Updated description 2');
      expect(updatedEntities[1].isActive).toBe(true);
      expect(updatedEntities[2].description).toBe('Updated description 3');
      expect(updatedEntities[2].count).toBe(100);
      
      // Verify IDs are preserved
      expect(updatedEntities[0]._id).toBe(createdEntities[0]._id);
      expect(updatedEntities[1]._id).toBe(createdEntities[1]._id);
      expect(updatedEntities[2]._id).toBe(createdEntities[2]._id);
    });

    it('should return empty array when batchUpdate is called with empty array', async () => {
      // Arrange
      const userContext = createUserContext();
      const emptyEntities: Partial<TestEntity>[] = [];
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, emptyEntities);
      
      // Assert
      expect(updatedEntities).toHaveLength(0);
      expect(Array.isArray(updatedEntities)).toBe(true);
    });

    it('should update audit fields when batch updating entities', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entity
      const testEntity: Partial<TestEntity> = {
        name: 'Entity for audit test',
        description: 'Original description'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Store original audit fields
      const originalCreated = createdEntity._created;
      const originalCreatedBy = createdEntity._createdBy;
      
      // Wait a bit to ensure _updated timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Prepare update
      const updateEntity: Partial<TestEntity> = {
        _id: createdEntity._id,
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForBatchUpdate(userContext, [updateEntity]);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._created).toEqual(originalCreated);
      expect(updatedEntities[0]._createdBy).toBe(originalCreatedBy);
      expect(updatedEntities[0]._updated).toBeDefined();
      expect(updatedEntities[0]._updatedBy).toBeDefined();
      // _updated should be different from original
      expect(updatedEntities[0]._updated).not.toEqual(createdEntity._updated);
    });

    it('should preserve unchanged fields when batch updating', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entity with multiple fields
      const testEntity: Partial<TestEntity> = {
        name: 'Entity with multiple fields',
        description: 'Original description',
        isActive: true,
        tags: ['tag1', 'tag2'],
        count: 42
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Update only description
      const updateEntity: Partial<TestEntity> = {
        _id: createdEntity._id,
        description: 'Updated description only'
      };
      
      const preparedUpdate = await service.prepareDataForBatchUpdate(userContext, [updateEntity]);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0].description).toBe('Updated description only');
      expect(updatedEntities[0].name).toBe('Entity with multiple fields');
      expect(updatedEntities[0].isActive).toBe(true);
      expect(updatedEntities[0].tags).toEqual(['tag1', 'tag2']);
      expect(updatedEntities[0].count).toBe(42);
    });

    it('should transform entity IDs from ObjectId to string in batch update results', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entity
      const testEntity: Partial<TestEntity> = {
        name: 'Entity for ID transformation test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Prepare update
      const updateEntity: Partial<TestEntity> = {
        _id: createdEntity._id,
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForBatchUpdate(userContext, [updateEntity]);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBeDefined();
      expect(typeof updatedEntities[0]._id).toBe('string');
      expect(updatedEntities[0]._id).toBe(createdEntity._id);
    });

    it('should update multiple entities with different field combinations', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entities
      const testEntities: Partial<TestEntity>[] = [
        { name: 'Entity A', isActive: true, count: 10 },
        { name: 'Entity B', isActive: false, count: 20 },
        { name: 'Entity C', isActive: true, count: 30 }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, testEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Prepare updates with different field combinations
      const updateEntities: Partial<TestEntity>[] = [
        { _id: createdEntities[0]._id, isActive: false }, // Only update isActive
        { _id: createdEntities[1]._id, count: 25, tags: ['new', 'tags'] }, // Update count and add tags
        { _id: createdEntities[2]._id, name: 'Entity C Updated', description: 'New description' } // Update name and description
      ];
      
      const preparedUpdates = await service.prepareDataForBatchUpdate(userContext, updateEntities);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdates);
      
      // Assert
      expect(updatedEntities).toHaveLength(3);
      
      // Verify first entity
      expect(updatedEntities[0].isActive).toBe(false);
      expect(updatedEntities[0].count).toBe(10); // Should be preserved
      
      // Verify second entity
      expect(updatedEntities[1].count).toBe(25);
      expect(updatedEntities[1].tags).toEqual(['new', 'tags']);
      expect(updatedEntities[1].isActive).toBe(false); // Should be preserved
      
      // Verify third entity
      expect(updatedEntities[2].name).toBe('Entity C Updated');
      expect(updatedEntities[2].description).toBe('New description');
      expect(updatedEntities[2].count).toBe(30); // Should be preserved
    });

    it('should handle batch update with single entity', async () => {
      // Arrange
      const userContext = createUserContext();
      
      // Create initial entity
      const testEntity: Partial<TestEntity> = {
        name: 'Single entity for batch update',
        description: 'Original'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, testEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Prepare update
      const updateEntity: Partial<TestEntity> = {
        _id: createdEntity._id,
        description: 'Updated via batch'
      };
      
      const preparedUpdate = await service.prepareDataForBatchUpdate(userContext, [updateEntity]);
      
      // Act
      const updatedEntities = await service.batchUpdate(userContext, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBe(createdEntity._id);
      expect(updatedEntities[0].description).toBe('Updated via batch');
      expect(updatedEntities[0].name).toBe('Single entity for batch update');
    });
  });

  describe('Full Update Operations', () => {
    it('should fully update an entity by ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Initial Name',
        description: 'Initial description',
        isActive: true,
        tags: ['tag1', 'tag2'],
        count: 10
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Full update with new entity
      const updateEntity: TestEntity = {
        name: 'Updated Name',
        description: 'Updated description',
        isActive: false,
        tags: ['tag3'],
        count: 20
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert
      expect(updatedEntity).toBeDefined();
      expect(updatedEntity._id).toBe(createdEntity._id);
      expect(updatedEntity.name).toBe('Updated Name');
      expect(updatedEntity.description).toBe('Updated description');
      expect(updatedEntity.isActive).toBe(false);
      expect(updatedEntity.tags).toEqual(['tag3']);
      expect(updatedEntity.count).toBe(20);
    });

    it('should preserve audit properties (_created, _createdBy) on full update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for audit preservation test',
        description: 'Original description'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Store original audit properties
      const originalCreated = createdEntity._created;
      const originalCreatedBy = createdEntity._createdBy;
      
      // Wait a bit to ensure _updated timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act - Full update
      const updateEntity: TestEntity = {
        name: 'Updated Name',
        description: 'Updated description'
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert - Audit properties should be preserved
      expect(updatedEntity._created).toEqual(originalCreated);
      expect(updatedEntity._createdBy).toBe(originalCreatedBy);
      // Updated properties should be set
      expect(updatedEntity._updated).toBeDefined();
      expect(updatedEntity._updatedBy).toBeDefined();
      // _updated should be different from original
      expect(updatedEntity._updated).not.toEqual(createdEntity._updated);
    });

    it('should update audit properties (_updated, _updatedBy) on full update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for audit update test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      const originalUpdated = createdEntity._updated;
      const originalUpdatedBy = createdEntity._updatedBy;
      
      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act
      const updateEntity: TestEntity = {
        name: 'Updated Name'
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert
      expect(updatedEntity._updated).toBeDefined();
      expect(updatedEntity._updatedBy).toBeDefined();
      expect(updatedEntity._updated).not.toEqual(originalUpdated);
      expect(updatedEntity._updatedBy).toBe(userContext.user._id);
    });

    it('should throw BadRequestError when fullUpdateById is called with invalid ObjectId', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidId = 'invalid-object-id';
      const updateEntity: TestEntity = {
        name: 'Updated Name'
      } as TestEntity;
      
      // Act & Assert
      await expect(
        service.fullUpdateById(userContext, invalidId, updateEntity)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw IdNotFoundError when fullUpdateById is called with non-existent ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const nonExistentId = new ObjectId().toString();
      const updateEntity: TestEntity = {
        name: 'Updated Name'
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      
      // Act & Assert
      await expect(
        service.fullUpdateById(userContext, nonExistentId, preparedUpdate as TestEntity)
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should fully replace all fields when updating', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Original Name',
        description: 'Original description',
        isActive: true,
        tags: ['tag1', 'tag2'],
        count: 100
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Full update with completely different fields
      const updateEntity: TestEntity = {
        name: 'Completely New Name',
        description: 'Completely new description',
        isActive: false,
        tags: ['newtag'],
        count: 200
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert - All fields should be replaced
      expect(updatedEntity.name).toBe('Completely New Name');
      expect(updatedEntity.description).toBe('Completely new description');
      expect(updatedEntity.isActive).toBe(false);
      expect(updatedEntity.tags).toEqual(['newtag']);
      expect(updatedEntity.count).toBe(200);
    });

    it('should transform entity ID from ObjectId to string in full update result', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for ID transformation test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act
      const updateEntity: TestEntity = {
        name: 'Updated Name'
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert
      expect(updatedEntity._id).toBeDefined();
      expect(typeof updatedEntity._id).toBe('string');
      expect(updatedEntity._id).toBe(createdEntity._id);
    });

    it('should handle full update with minimal fields', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Original Name',
        description: 'Original description',
        isActive: true
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Full update with only required field
      const updateEntity: TestEntity = {
        name: 'Minimal Update'
      } as TestEntity;
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.fullUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate as TestEntity
      );
      
      // Assert
      expect(updatedEntity.name).toBe('Minimal Update');
      expect(updatedEntity.description).toBeUndefined();
      expect(updatedEntity.isActive).toBeUndefined();
      expect(updatedEntity._id).toBe(createdEntity._id);
    });
  });

  describe('Partial Update Operations', () => {
    it('should partially update an entity by ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Initial Name',
        description: 'Initial description',
        isActive: true,
        tags: ['tag1', 'tag2'],
        count: 10
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Partial update with only some fields
      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name',
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity).toBeDefined();
      expect(updatedEntity._id).toBe(createdEntity._id);
      expect(updatedEntity.name).toBe('Updated Name');
      expect(updatedEntity.description).toBe('Updated description');
      // Unchanged fields should be preserved
      expect(updatedEntity.isActive).toBe(true);
      expect(updatedEntity.tags).toEqual(['tag1', 'tag2']);
      expect(updatedEntity.count).toBe(10);
    });

    it('should preserve unchanged fields when partially updating', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Original Name',
        description: 'Original description',
        isActive: true,
        tags: ['tag1', 'tag2'],
        count: 100
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Update only description
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description only'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert - All other fields should be preserved
      expect(updatedEntity.name).toBe('Original Name');
      expect(updatedEntity.description).toBe('Updated description only');
      expect(updatedEntity.isActive).toBe(true);
      expect(updatedEntity.tags).toEqual(['tag1', 'tag2']);
      expect(updatedEntity.count).toBe(100);
    });

    it('should preserve audit properties (_created, _createdBy) on partial update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for audit preservation test',
        description: 'Original description'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Store original audit properties
      const originalCreated = createdEntity._created;
      const originalCreatedBy = createdEntity._createdBy;
      
      // Wait a bit to ensure _updated timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act - Partial update
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert - Audit properties should be preserved
      expect(updatedEntity._created).toEqual(originalCreated);
      expect(updatedEntity._createdBy).toBe(originalCreatedBy);
      // Updated properties should be set
      expect(updatedEntity._updated).toBeDefined();
      expect(updatedEntity._updatedBy).toBeDefined();
      // _updated should be different from original
      expect(updatedEntity._updated).not.toEqual(createdEntity._updated);
    });

    it('should update audit properties (_updated, _updatedBy) on partial update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for audit update test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      const originalUpdated = createdEntity._updated;
      const originalUpdatedBy = createdEntity._updatedBy;
      
      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act
      const updateEntity: Partial<TestEntity> = {
        description: 'New description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity._updated).toBeDefined();
      expect(updatedEntity._updatedBy).toBeDefined();
      expect(updatedEntity._updated).not.toEqual(originalUpdated);
      expect(updatedEntity._updatedBy).toBe(userContext.user._id);
    });

    it('should throw BadRequestError when partialUpdateById is called with invalid ObjectId', async () => {
      // Arrange
      const userContext = createUserContext();
      const invalidId = 'invalid-object-id';
      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name'
      };
      
      // Act & Assert
      await expect(
        service.partialUpdateById(userContext, invalidId, updateEntity)
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw IdNotFoundError when partialUpdateById is called with non-existent ID', async () => {
      // Arrange
      const userContext = createUserContext();
      const nonExistentId = new ObjectId().toString();
      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      
      // Act & Assert
      await expect(
        service.partialUpdateById(userContext, nonExistentId, preparedUpdate)
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should update multiple fields in a single partial update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Original Name',
        description: 'Original description',
        isActive: true,
        count: 10
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Update multiple fields
      const updateEntity: Partial<TestEntity> = {
        name: 'Updated Name',
        isActive: false,
        count: 20,
        tags: ['newtag']
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity.name).toBe('Updated Name');
      expect(updatedEntity.isActive).toBe(false);
      expect(updatedEntity.count).toBe(20);
      expect(updatedEntity.tags).toEqual(['newtag']);
      // Unchanged field should be preserved
      expect(updatedEntity.description).toBe('Original description');
    });

    it('should transform entity ID from ObjectId to string in partial update result', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity for ID transformation test'
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity._id).toBeDefined();
      expect(typeof updatedEntity._id).toBe('string');
      expect(updatedEntity._id).toBe(createdEntity._id);
    });

    it('should handle partial update with single field', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Original Name',
        description: 'Original description',
        isActive: true
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Update only one field
      const updateEntity: Partial<TestEntity> = {
        isActive: false
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity.isActive).toBe(false);
      expect(updatedEntity.name).toBe('Original Name');
      expect(updatedEntity.description).toBe('Original description');
    });

    it('should update nested array fields in partial update', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity with tags',
        tags: ['tag1', 'tag2']
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Update tags
      const updateEntity: Partial<TestEntity> = {
        tags: ['tag3', 'tag4', 'tag5']
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const updatedEntity = await service.partialUpdateById(
        userContext,
        createdEntity._id,
        preparedUpdate
      );
      
      // Assert
      expect(updatedEntity.tags).toEqual(['tag3', 'tag4', 'tag5']);
      expect(updatedEntity.name).toBe('Entity with tags');
    });
  });

  describe('Update Operations', () => {
    it('should update multiple entities matching a query', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true, count: 10 },
        { name: 'Entity 2', isActive: true, count: 20 },
        { name: 'Entity 3', isActive: false, count: 30 }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act - Update all active entities
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description for active entities'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { isActive: true };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(2);
      updatedEntities.forEach(entity => {
        expect(entity.isActive).toBe(true);
        expect(entity.description).toBe('Updated description for active entities');
      });
      
      // Verify unchanged fields are preserved
      expect(updatedEntities[0].name).toBe('Entity 1');
      expect(updatedEntities[0].count).toBe(10);
      expect(updatedEntities[1].name).toBe('Entity 2');
      expect(updatedEntities[1].count).toBe(20);
    });

    it('should update entities matching query with _id', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntity: Partial<TestEntity> = {
        name: 'Entity to update',
        isActive: true
      };
      
      const preparedEntity = await service.prepareDataForDb(userContext, initialEntity, true);
      const createdEntity = await service.create(userContext, preparedEntity);
      
      if (!createdEntity || !createdEntity._id) {
        throw new Error('Entity not created or missing ID');
      }
      
      // Act - Update by _id
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated via query'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { _id: createdEntity._id };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBe(createdEntity._id);
      expect(updatedEntities[0].description).toBe('Updated via query');
      expect(updatedEntities[0].name).toBe('Entity to update');
      expect(updatedEntities[0].isActive).toBe(true);
    });

    it('should preserve unchanged fields when updating multiple entities', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity A', description: 'Original A', isActive: true, count: 100 },
        { name: 'Entity B', description: 'Original B', isActive: true, count: 200 }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act - Update only description field (doesn't affect the query)
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { isActive: true };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert - Verify the update worked
      expect(updatedEntities).toHaveLength(2);
      updatedEntities.forEach(entity => {
        expect(entity.description).toBe('Updated description');
        expect(entity.isActive).toBe(true); // Should remain unchanged
      });
      
      // Verify other fields are preserved
      const entityA = updatedEntities.find(e => e.name === 'Entity A');
      const entityB = updatedEntities.find(e => e.name === 'Entity B');
      
      expect(entityA).toBeDefined();
      expect(entityA!.name).toBe('Entity A');
      expect(entityA!.count).toBe(100);
      expect(entityB).toBeDefined();
      expect(entityB!.name).toBe('Entity B');
      expect(entityB!.count).toBe(200);
    });

    it('should update audit properties on all updated entities', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true },
        { name: 'Entity 2', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      const originalUpdated1 = createdEntities[0]._updated;
      const originalUpdated2 = createdEntities[1]._updated;
      
      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Act
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated description'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { isActive: true };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(2);
      updatedEntities.forEach(entity => {
        expect(entity._updated).toBeDefined();
        expect(entity._updatedBy).toBeDefined();
        expect(entity._updatedBy).toBe(userContext.user._id);
      });
      
      expect(updatedEntities[0]._updated).not.toEqual(originalUpdated1);
      expect(updatedEntities[1]._updated).not.toEqual(originalUpdated2);
    });

    it('should throw NotFoundError when no entities match the query', async () => {
      // Arrange
      const userContext = createUserContext();
      const updateEntity: Partial<TestEntity> = {
        description: 'This should not update anything'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { name: 'Non-existent Entity' };
      
      // Act & Assert
      await expect(
        service.update(userContext, queryObject, preparedUpdate)
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle query with multiple conditions', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true, count: 10 },
        { name: 'Entity 2', isActive: true, count: 20 },
        { name: 'Entity 3', isActive: true, count: 30 },
        { name: 'Entity 4', isActive: false, count: 40 }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act - Update entities that are active AND have count >= 20
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated for active entities with count >= 20'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { isActive: true, count: { $gte: 20 } };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(2);
      updatedEntities.forEach(entity => {
        expect(entity.isActive).toBe(true);
        expect((entity.count || 0) >= 20).toBe(true);
        expect(entity.description).toBe('Updated for active entities with count >= 20');
      });
    });

    it('should transform entity IDs from ObjectId to string in update results', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true },
        { name: 'Entity 2', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = { isActive: true };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(2);
      updatedEntities.forEach(entity => {
        expect(entity._id).toBeDefined();
        expect(typeof entity._id).toBe('string');
      });
    });

    it('should handle query with $in operator for _id', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true },
        { name: 'Entity 2', isActive: false },
        { name: 'Entity 3', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      const createdEntities = await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act - Update specific entities by _id using $in
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated via $in query'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const targetIds = [createdEntities[0]._id, createdEntities[2]._id];
      const queryObject = { _id: { $in: targetIds } };
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(2);
      const updatedIds = updatedEntities.map(e => e._id).sort();
      const expectedIds = targetIds.sort();
      expect(updatedIds).toEqual(expectedIds);
      updatedEntities.forEach(entity => {
        expect(entity.description).toBe('Updated via $in query');
      });
    });

    it('should update all entities when query matches all', async () => {
      // Arrange
      const userContext = createUserContext();
      const initialEntities: Partial<TestEntity>[] = [
        { name: 'Entity 1', isActive: true },
        { name: 'Entity 2', isActive: false },
        { name: 'Entity 3', isActive: true }
      ];
      
      const preparedEntities = await service.prepareDataForDb(userContext, initialEntities, true);
      await service.createMany(userContext, preparedEntities as TestEntity[]);
      
      // Act - Update all entities (empty query matches all)
      const updateEntity: Partial<TestEntity> = {
        description: 'Updated all entities'
      };
      
      const preparedUpdate = await service.prepareDataForDb(userContext, updateEntity, false);
      const queryObject = {};
      const updatedEntities = await service.update(userContext, queryObject, preparedUpdate);
      
      // Assert
      expect(updatedEntities).toHaveLength(3);
      updatedEntities.forEach(entity => {
        expect(entity.description).toBe('Updated all entities');
      });
    });
  });
}); 
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Db, MongoClient, Collection, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IUserContext, IEntity, IAuditable } from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';

import { DuplicateKeyError } from '../../errors/index.js';
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
  });
  
  describe('Error Handling', () => {
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
}); 
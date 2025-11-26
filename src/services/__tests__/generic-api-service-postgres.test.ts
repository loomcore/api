import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IUserContext } from '@loomcore/common/models';
import { GenericApiService } from '../generic-api-service/generic-api.service.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { IDatabase } from '../../databases/models/index.js';
import { testUserContext } from '../../__tests__/test-objects.js';

describe('GenericApiService - Sql Integration Tests', () => {
  let database: IDatabase;
  let testEntityService: GenericApiService<TestEntity>;
  
  // Set up TestExpressApp before all tests
  beforeAll(async () => {
    const testSetup = await TestExpressApp.init(false);
    database = testSetup.database;
    
    // Create service with auditable model spec
    testEntityService = new GenericApiService<TestEntity>(
      testSetup.database,
      'testEntities',
      'testEntity',
      testModelSpec
    );
  });
  
  // Clean up TestExpressApp after all tests
  afterAll(async () => {
    await TestExpressApp.cleanup();
  });
  
  // Clear collections before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();
  });
  
  describe('CRUD Operations', () => {
    it('should create an entity', async () => {
      // Arrange
      const testEntity: Partial<TestEntity> = {
        name: 'Test Entity',
        description: 'This is a test entity',
        isActive: true
      };
      
      // Act
      const createdEntity = await testEntityService.create(testUserContext, testEntity);
      
      // Assert
      expect(createdEntity).toBeDefined();
      expect(createdEntity?.name).toBe(testEntity.name);
      expect(createdEntity?.description).toBe(testEntity.description);
      expect(createdEntity?.isActive).toBe(testEntity.isActive);
    });

    it('should retrieve all entities with PostgreSQL database', { skip: true }, async () => {

      const testEntities: TestEntity[] = [
        { name: 'Entity 1', isActive: true } as TestEntity,
        { name: 'Entity 2', isActive: false } as TestEntity,
        { name: 'Entity 3', isActive: true } as TestEntity
      ];
      // Act
      for (const entity of testEntities) {
        await testEntityService.create(testUserContext, entity);
      }
      const allEntities = await testEntityService.getAll(testUserContext);
      // Assert
      expect(allEntities).toHaveLength(3);
      
      // Cleanup
      await TestExpressApp.cleanup();
    });

  });
}); 
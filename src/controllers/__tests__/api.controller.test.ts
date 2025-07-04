import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';
import { Db, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IEntity, IAuditable } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { ApiController } from '../api.controller.js';
import { GenericApiService } from '../../services/generic-api.service.js';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';

// Mock model for testing
interface ITestItem extends IEntity, IAuditable {
  name: string;
  value?: number;
}

const TestItemSchema = Type.Object({
  name: Type.String(),
  value: Type.Optional(Type.Number())
});

// Create model specs - auditable
const TestItemSpec = entityUtils.getModelSpec(TestItemSchema, { isAuditable: true });

// Test service and controller
class TestItemService extends GenericApiService<ITestItem> {
  constructor(db: Db) {
    super(db, 'testItems', 'testItem', TestItemSpec);
  }
}

class TestItemController extends ApiController<ITestItem> {
  public testItemService: TestItemService;

  constructor(app: Application, db: Db) {
    const testItemService = new TestItemService(db);
    super('test-items', app, testItemService, 'testItem', TestItemSpec);

    this.testItemService = testItemService;
  }
}


// For testing user creation with explicit public schema
interface ITestUser extends IEntity, IAuditable {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

const TestUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 6 }),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String())
});

// Create user model spec with auditable
const TestUserSpec = entityUtils.getModelSpec(TestUserSchema, { isAuditable: true });

// Create a public schema that omits password
const TestPublicUserSchema = Type.Omit(TestUserSpec.fullSchema, ['password']);

class TestUserService extends GenericApiService<ITestUser> {
  constructor(db: Db) {
    super(db, 'testUsers', 'testUser', TestUserSpec);
  }
}

class TestUserController extends ApiController<ITestUser> {
  public testUserService: TestUserService;

  constructor(app: Application, db: Db) {
    const testUserService = new TestUserService(db);
    super('test-users', app, testUserService, 'testUser', TestUserSpec, TestPublicUserSchema);

    this.testUserService = testUserService;
  }
}

/**
 * This suite tests the ApiController.
 * It uses our custom test utilities for MongoDB and Express.
 */
describe('ApiController - Integration Tests', () => {
  let db: Db;
  let app: Application;
  let testAgent: any;
  let authToken: string;
  let service: TestItemService;
  let controller: TestItemController;
  let userService: TestUserService;
  let usersController: TestUserController;
  let userId: string;

  beforeAll(async () => {
    // Initialize with our new test express app
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    db = testSetup.db;
    testAgent = testSetup.agent;
    
    // Get auth token and user ID from testUtils
    authToken = testUtils.getAuthToken();
    userId = testUtils.testUserId;
    
    // Create service and controller instances
    controller = new TestItemController(app, db);
    service = controller.testItemService;
    
    // Create user service and controller
    usersController = new TestUserController(app, db);
    userService = usersController.testUserService;

    await TestExpressApp.setupErrorHandling(); // needs to come after all controllers are created
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await TestExpressApp.clearCollections();
  });

  describe('GET /:id - _id as string', () => {
    it('should return an entity with _id as a string, not an object', async () => {
      // Create a test item first
      const newItem = { name: 'Test for ID type' };
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send(newItem);

      expect(createResponse.status).toBe(201);
      const createdItem = createResponse.body.data;
      const itemId = createdItem._id;
      expect(typeof itemId).toBe('string');

      // Now fetch the item by its ID
      const getResponse = await testAgent
        .get(`/api/test-items/${itemId}`)
        .set('Authorization', authToken);
      
      // Assertions
      expect(getResponse.status).toBe(200);
      const fetchedItem = getResponse.body.data;
      expect(fetchedItem).toHaveProperty('_id');

      expect(typeof fetchedItem._id).toBe('string');
      expect(fetchedItem._id).toBe(itemId);
    });
  });

  describe('auditable behavior', () => {
    it('should include audit properties in POST response', async () => {
      // Make the API request with the token from testUtils
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Test Item' });
        
      // Assertions
      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('_created');
      expect(response.body.data).toHaveProperty('_createdBy');
      expect(response.body.data).toHaveProperty('_updated');
      expect(response.body.data).toHaveProperty('_updatedBy');
    });

    it('should update audit fields correctly when using PATCH', async () => {
      // First create an item
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Name', value: 100 });
      
      expect(createResponse.status).toBe(201);
      
      // Extract the entity from the response
      const originalItem = createResponse.body.data;
      expect(originalItem).toBeDefined();
      expect(originalItem._id).toBeDefined();

      const itemId = originalItem._id;
      
      // Wait a bit to ensure timestamps differ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update with PATCH
      const updateResponse = await testAgent
        .patch(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send({ name: 'Updated Name' });
      
      expect(updateResponse.status).toBe(200);
      
      // Extract the updated entity
      const updatedItem = updateResponse.body.data;
      expect(updatedItem).toBeDefined();
      
      // Verify audit properties
      expect(updatedItem._created).toEqual(originalItem._created);
      expect(updatedItem._createdBy).toEqual(originalItem._createdBy);
      expect(updatedItem._updated).not.toEqual(originalItem._updated);
      expect(updatedItem._updatedBy).toEqual(userId);
    });

    it('should update audit fields correctly when using PUT', async () => {
      // First create an item
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Name', value: 100 });
      
      expect(createResponse.status).toBe(201);
      
      // Extract the entity from the response
      const originalItem = createResponse.body.data;
      expect(originalItem).toBeDefined();
      expect(originalItem._id).toBeDefined();
      
      const itemId = originalItem._id;
      
      // Wait a bit to ensure timestamps differ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update with PUT - include all required fields
      const updateResponse = await testAgent
        .put(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send({ 
          name: 'New Name', 
          value: 200
        });
      
      expect(updateResponse.status).toBe(200);
      
      // Extract the updated entity
      const updatedItem = updateResponse.body.data;
      expect(updatedItem).toBeDefined();
      
      // Verify audit properties
      expect(updatedItem._created).toEqual(originalItem._created);
      expect(updatedItem._createdBy).toEqual(originalItem._createdBy);
      expect(updatedItem._updated).not.toEqual(originalItem._updated);
      expect(updatedItem._updatedBy).toEqual(userId);
    });

    it('should reject attempts to tamper with audit properties', async () => {
      // First create an item
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Item' });
      
      expect(createResponse.status).toBe(201);
      
      // Extract the entity from the response
      const originalItem = createResponse.body.data;
      expect(originalItem).toBeDefined();
      expect(originalItem._id).toBeDefined();
      
      const itemId = originalItem._id;
      
      // Try to tamper with audit properties during update
      const tamperedDate = new Date(2000, 1, 1).toISOString();
      const updateResponse = await testAgent
        .patch(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send({ 
          name: 'Tampered Item',
          _created: tamperedDate,
          _createdBy: 'hacker',
          _updated: tamperedDate,
          _updatedBy: 'hacker'
        });
      
      expect(updateResponse.status).toBe(200);
      
      // Extract the updated entity
      const updatedItem = updateResponse.body.data;
      expect(updatedItem).toBeDefined();
      
      // Verify tamper attempt failed
      expect(updatedItem._created).toEqual(originalItem._created);
      expect(updatedItem._createdBy).toEqual(originalItem._createdBy);
      expect(updatedItem._updated).not.toEqual(tamperedDate);
      expect(updatedItem._updatedBy).not.toEqual('hacker');
      expect(updatedItem._updatedBy).toEqual(userId);
    });

    it('should preserve audit properties when returning lists of items', async () => {
      // Create several items
      const item1Response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Item 1', value: 10 })
        .expect(201);
      
      const item2Response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Item 2', value: 20 })
        .expect(201);
      
      // Get all items via HTTP
      const response = await testAgent
        .get('/api/test-items')
        .set('Authorization', authToken)
        .expect(200);
      
      // ApiController returns responses wrapped in IApiResponse format with paged result
      const pagedResult = response.body.data;
      const items = pagedResult?.entities;
      
      // Verify we got an array of items
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      
      // Verify all items have audit properties
      items.forEach((item: any) => {
        expect(item).toHaveProperty('_created');
        expect(item).toHaveProperty('_createdBy');
        expect(item).toHaveProperty('_updated');
        expect(item).toHaveProperty('_updatedBy');
      });
    });

    it('should return audit properties when getting a single item', async () => {
      // Create an item
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Single Item', value: 42 });
      
      expect(createResponse.status).toBe(201);
      
      // Extract the entity and ID from the response
      const createdItem = createResponse.body.data;
      expect(createdItem).toBeDefined();
      
      const itemId = createdItem._id;
      expect(itemId).toBeDefined();
      
      // Get the item
      const getResponse = await testAgent
        .get(`/api/test-items/${itemId}`)
        .set('Authorization', authToken);
      
      expect(getResponse.status).toBe(200);
      
      // Extract the retrieved entity
      const retrievedItem = getResponse.body.data;
      expect(retrievedItem).toBeDefined();
      
      // Verify audit properties
      expect(retrievedItem).toHaveProperty('_created');
      expect(retrievedItem).toHaveProperty('_createdBy', userId);
      expect(retrievedItem).toHaveProperty('_updated');
      expect(retrievedItem).toHaveProperty('_updatedBy', userId);
    });
  });

  describe('user creation with public schema', () => {
    it('should include audit properties and exclude properties not in public schema', async () => {
      // Log that we're preparing the test user data
      const testUser = {
        email: 'testuser@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      };
      
      try {
        // Create a new user with auth
        const response = await testAgent
          .post('/api/test-users')
          .set('Authorization', authToken)
          .send(testUser);
        
        expect(response.status).toBe(201);
        
        // Check if the response is wrapped in a success/data format
        const entity = response.body.data;
        
        expect(entity).toBeDefined();
        
        // Verify user properties
        expect(entity.email).toBe('testuser@example.com');
        expect(entity.firstName).toBe('Test');
        expect(entity.lastName).toBe('User');
        
        // Verify password is not included (removed by public schema)
        expect(entity).not.toHaveProperty('password');
        
        // Verify audit properties are present - this is what our test is checking for
        expect(entity).toHaveProperty('_created');
        expect(entity).toHaveProperty('_createdBy', userId);
        expect(entity).toHaveProperty('_updated');
        expect(entity).toHaveProperty('_updatedBy', userId);
      } catch (error) {
        console.error('Error during user creation test:', error);
        throw error;
      }
    });
    
    it('should return 401 when trying to access secured endpoint without authentication', async () => {
      // Make a request without authorization header
      const response = await testAgent
        .post('/api/test-users')
        .send({
          email: 'unauthorized@example.com',
          password: 'password123'
        });

      // Verify that authentication is enforced
      expect(response.status).toBe(401);
    });
  });

  describe('Validation and Data Preparation Integration', () => {
    it('should strip properties not defined in the schema while preserving system properties', async () => {
      // Create an entity with extra properties not defined in the schema
      const testEntity = {
        name: 'Entity with extra props',
        value: 42,
        extraProperty: 'This property is not in the schema',
        anotherExtraProperty: 999,
        nestedExtra: { foo: 'bar' }
      };
      
      // Act - Create via controller endpoint
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send(testEntity);
      
      // Assert
      expect(response.status).toBe(201);
      const createdEntity = response.body.data;
      
      expect(createdEntity).toBeDefined();
      expect(createdEntity.name).toBe(testEntity.name);
      expect(createdEntity.value).toBe(testEntity.value);
      
      // Check that extra properties were stripped out
      expect(createdEntity.extraProperty).toBeUndefined();
      expect(createdEntity.anotherExtraProperty).toBeUndefined();
      expect(createdEntity.nestedExtra).toBeUndefined();
      
      // Check that system properties were preserved/added
      expect(createdEntity._id).toBeDefined();
      expect(createdEntity._created).toBeDefined();
      expect(createdEntity._createdBy).toBeDefined();
      expect(createdEntity._updated).toBeDefined();
      expect(createdEntity._updatedBy).toBeDefined();
    });

    it('should reject invalid entities with proper validation errors', async () => {
      // Try to create an entity missing required fields
      const invalidEntity = {
        // Missing required 'name' field
        value: 42,
        extraProperty: 'Extra'
      };
      
      // Act & Assert
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send(invalidEntity);
      
      expect(response.status).toBe(400); // Should be a validation error
    });

    it('should reject partial updates with invalid data', async () => {
      // First create a valid entity
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Valid Item', value: 100 });
      
      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      
      // Try to update with invalid data
      const invalidUpdate = {
        name: '', // Empty string should fail validation
        value: 'not a number' // Wrong type
      };
      
      const response = await testAgent
        .patch(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send(invalidUpdate);
      
      expect(response.status).toBe(400); // Should be a validation error
    });

    it('should handle partial updates correctly with valid partial data', async () => {
      // First create an entity
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Item', value: 100 });
      
      expect(createResponse.status).toBe(201);
      const originalItem = createResponse.body.data;
      const itemId = originalItem._id;
      
      // Update only the value field
      const partialUpdate = {
        value: 200
        // name should remain unchanged
      };
      
      const response = await testAgent
        .patch(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send(partialUpdate);
      
      expect(response.status).toBe(200);
      const updatedItem = response.body.data;
      
      // Verify partial update worked correctly
      expect(updatedItem.name).toBe(originalItem.name); // Unchanged
      expect(updatedItem.value).toBe(200); // Updated
      expect(updatedItem._created).toEqual(originalItem._created); // Preserved
      expect(updatedItem._updated).not.toEqual(originalItem._updated); // Updated
    });
  });

  describe('Comprehensive Audit Functionality Integration', () => {
    it('should add all auditable properties on creation', async () => {
      const entity = { name: 'AuditTest', value: 42 };
      
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send(entity);
      
      expect(response.status).toBe(201);
      const result = response.body.data;
      
      expect(result).toBeDefined();
      expect(result._created).toBeDefined();
      expect(result._createdBy).toBe(userId);
      expect(result._updated).toBeDefined();
      expect(result._updatedBy).toBe(userId);
      expect(new Date(result._created)).toBeInstanceOf(Date);
      expect(new Date(result._updated)).toBeInstanceOf(Date);
    });

    it('should not allow client to override audit properties on create', async () => {
      const hackDate = new Date(2020, 1, 1).toISOString();
      
      // Try to create with tampered audit properties
      const entity = { 
        name: 'TamperTest',
        value: 42,
        _created: hackDate,
        _createdBy: 'hacker',
        _updated: hackDate,
        _updatedBy: 'hacker'
      };
      
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send(entity);
      
      expect(response.status).toBe(201);
      const result = response.body.data;
      
      expect(result).toBeDefined();
      expect(result._created).not.toEqual(hackDate);
      expect(result._createdBy).not.toEqual('hacker');
      expect(result._updated).not.toEqual(hackDate);
      expect(result._updatedBy).not.toEqual('hacker');
      expect(result._createdBy).toEqual(userId);
      expect(result._updatedBy).toEqual(userId);
    });

    it('should update _updated and _updatedBy on update but preserve _created and _createdBy', async () => {
      // First create an entity
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'UpdateTest', value: 100 });
      
      expect(createResponse.status).toBe(201);
      const createdItem = createResponse.body.data;
      
      const originalCreated = createdItem._created;
      const originalCreatedBy = createdItem._createdBy;
      const itemId = createdItem._id;
      
      // Wait a moment to ensure timestamps differ
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update the entity
      const updateResponse = await testAgent
        .patch(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send({ name: 'Updated Test' });
      
      expect(updateResponse.status).toBe(200);
      const updatedItem = updateResponse.body.data;
      
      // Check audit fields
      expect(updatedItem._created).toEqual(originalCreated);
      expect(updatedItem._createdBy).toEqual(originalCreatedBy);
      expect(updatedItem._updated).not.toEqual(createdItem._updated);
      expect(updatedItem._updatedBy).toEqual(userId);
    });

    it('should handle full updates (PUT) with proper audit trail', async () => {
      // Create initial entity
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'PUT Test', value: 50 });
      
      expect(createResponse.status).toBe(201);
      const createdItem = createResponse.body.data;
      const itemId = createdItem._id;
      
      // Wait to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Full update with PUT
      const updateResponse = await testAgent
        .put(`/api/test-items/${itemId}`)
        .set('Authorization', authToken)
        .send({ name: 'PUT Updated', value: 75 });
      
      expect(updateResponse.status).toBe(200);
      const updatedItem = updateResponse.body.data;
      
      // Verify audit properties
      expect(updatedItem._created).toEqual(createdItem._created);
      expect(updatedItem._createdBy).toEqual(createdItem._createdBy);
      expect(updatedItem._updated).not.toEqual(createdItem._updated);
      expect(updatedItem._updatedBy).toEqual(userId);
      expect(updatedItem.name).toBe('PUT Updated');
      expect(updatedItem.value).toBe(75);
    });

    it('should handle bulk operations with audit properties', async () => {
      // Create multiple entities to test bulk behavior
      const entities = [
        { name: 'Bulk Item 1', value: 10 },
        { name: 'Bulk Item 2', value: 20 },
        { name: 'Bulk Item 3', value: 30 }
      ];
      
      const createPromises = entities.map(entity => 
        testAgent
          .post('/api/test-items')
          .set('Authorization', authToken)
          .send(entity)
      );
      
      const responses = await Promise.all(createPromises);
      
      // Verify all were created successfully
      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        const item = response.body.data;
        expect(item.name).toBe(entities[index].name);
        expect(item.value).toBe(entities[index].value);
        expect(item._created).toBeDefined();
        expect(item._createdBy).toBe(userId);
        expect(item._updated).toBeDefined();
        expect(item._updatedBy).toBe(userId);
      });
      
      // Verify via list endpoint
      const listResponse = await testAgent
        .get('/api/test-items')
        .set('Authorization', authToken);
      
      expect(listResponse.status).toBe(200);
      const pagedResult = listResponse.body.data;
      expect(pagedResult.entities.length).toBeGreaterThanOrEqual(3);
      
      // Check that all returned entities have audit properties
      pagedResult.entities.forEach((item: any) => {
        expect(item._created).toBeDefined();
        expect(item._createdBy).toBeDefined();
        expect(item._updated).toBeDefined();
        expect(item._updatedBy).toBeDefined();
      });
    });
  });
}); 
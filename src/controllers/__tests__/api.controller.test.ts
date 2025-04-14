import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';
import { Db, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';

import { ApiController } from '../api.controller.js';
import { GenericApiService } from '../../services/generic-api.service.js';
import { IEntity, IAuditable } from '../../models/index.js';
import { entityUtils } from '../../utils/index.js';

// Import our new test utilities
import { TestExpressApp } from '../../__tests__/setup/test-express-app.js';
import { CommonTestUtils } from '../../__tests__/setup/common-test.utils.js';

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
describe('[library] ApiController - Integration Tests', () => {
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
    
    // Get auth token and user ID from CommonTestUtils
    authToken = CommonTestUtils.getAuthToken();
    userId = CommonTestUtils.getUserId();
    
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

  describe('auditable behavior', () => {
    it('should include audit properties in POST response', async () => {
      // Make the API request with the token from CommonTestUtils
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
}); 
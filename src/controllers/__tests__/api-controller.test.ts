import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';

import { ApiController } from '../api.controller.js';

import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { GenericApiService } from '../../services/generic-api-service/generic-api.service.js';
import { IDatabase } from '../../databases/models/index.js';
import { getTestMetaOrgUserContext } from '../../__tests__/test-objects.js';
import { ITestItem, TestItemSpec } from '../../__tests__/models/test-item.model.js';
import { AuthController } from '../auth.controller.js';

// Test service and controller
class TestItemService extends GenericApiService<ITestItem> {
  constructor(database: IDatabase) {
    super(database, 'testItems', 'testItem', TestItemSpec);
  }
}

class TestItemController extends ApiController<ITestItem> {
  public testItemService: TestItemService;

  constructor(app: Application, database: IDatabase) {
    const testItemService = new TestItemService(database);
    super('test-items', app, testItemService, 'testItem', TestItemSpec);

    this.testItemService = testItemService;
  }
}

function expectPublicItem(item: any) {
  expect(item).toBeDefined();
  expect(item._id).toBeDefined();
  expect(item).not.toHaveProperty('_created');
  expect(item).not.toHaveProperty('_createdBy');
  expect(item).not.toHaveProperty('_updated');
  expect(item).not.toHaveProperty('_updatedBy');
  expect(item).not.toHaveProperty('_deleted');
  expect(item).not.toHaveProperty('_deletedBy');
}

/**
 * This suite tests the ApiController.
 * It uses our custom test utilities for MongoDB and Express.
 */
describe('ApiController - Integration Tests', () => {
  let database: IDatabase;
  let app: Application;
  let testAgent: any;
  let authToken: string;
  let testItemService: TestItemService;
  let testItemController: TestItemController;
  let userId: string | number;
  let isPostgres: boolean;

  beforeAll(async () => {
    // Initialize with our new test express app
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    database = testSetup.database;
    testAgent = testSetup.agent;

    // Determine database type from env var (which is now guaranteed to be set by vitest-setup.ts)
    isPostgres = process.env.TEST_DATABASE === 'postgres';

    // Create service and controller instances
    testItemController = new TestItemController(app, database);
    testItemService = testItemController.testItemService;

    // Initialize AuthController (needed for loginWithTestUser)
    new AuthController(app, database);

    await TestExpressApp.setupErrorHandling(); // needs to come after all controllers are created

    // Set up test users and organizations (required for foreign key constraints)
    const { metaOrgUser } = await testUtils.setupTestUsers();

    // Get auth token from actual login (has proper userContext structure)
    authToken = await testUtils.loginWithTestUser(testAgent);

    // Use the actual user ID from the created user (not the hardcoded one)
    // This ensures we have the correct ID type (number for PostgreSQL, string for MongoDB)
    userId = metaOrgUser._id;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await TestExpressApp.clearCollections();
    // Recreate test users and organizations after clearing (required for foreign key constraints)
    const { metaOrgUser } = await testUtils.setupTestUsers();
    // Update userId with the actual created user ID (correct type for current database)
    userId = metaOrgUser._id;
    // Refresh auth token after recreating users (ensures token has correct userContext)
    authToken = await testUtils.loginWithTestUser(testAgent);
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

      // ID type depends on database: PostgreSQL uses numbers, MongoDB uses strings
      if (isPostgres) {
        expect(typeof itemId).toBe('number');
      } else {
        expect(typeof itemId).toBe('string');
      }

      // Now fetch the item by its ID (convert to string for URL)
      const getResponse = await testAgent
        .get(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken);

      // Assertions
      expect(getResponse.status).toBe(200);
      const fetchedItem = getResponse.body.data;
      expect(fetchedItem).toHaveProperty('_id');

      // ID type depends on database
      if (isPostgres) {
        expect(typeof fetchedItem._id).toBe('number');
      } else {
        expect(typeof fetchedItem._id).toBe('string');
      }
      expect(fetchedItem._id).toBe(itemId);
    });
  });

  describe('auditable behavior', () => {
    it('should omit audit properties from the default public POST response but keep _id', async () => {
      const response = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Test Item' });

      expect(response.status).toBe(201);
      expectPublicItem(response.body.data);
      expect(response.body.data.name).toBe('Test Item');

      const stored = await testItemService.getById(getTestMetaOrgUserContext(), response.body.data._id);
      expect(stored._created).toBeDefined();
      expect(stored._createdBy).toBe(userId);
    });

    it('should update audit fields correctly when using PATCH', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Name', value: 100 });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      expect(itemId).toBeDefined();
      const originalStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);

      await new Promise(resolve => setTimeout(resolve, 100));

      const updateResponse = await testAgent
        .patch(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send({ name: 'Updated Name' });

      expect(updateResponse.status).toBe(200);
      expectPublicItem(updateResponse.body.data);
      expect(updateResponse.body.data.name).toBe('Updated Name');

      const updatedStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(updatedStored._created).toEqual(originalStored._created);
      expect(updatedStored._createdBy).toEqual(originalStored._createdBy);
      expect(updatedStored._updated).toBeDefined();
      expect(updatedStored._updatedBy).toEqual(userId);
    });

    it('should update audit fields correctly when using PUT', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Name', value: 100 });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      expect(itemId).toBeDefined();
      const originalStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);

      await new Promise(resolve => setTimeout(resolve, 100));

      const updateResponse = await testAgent
        .put(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send({
          name: 'New Name',
          value: 200
        });

      expect(updateResponse.status).toBe(200);
      expectPublicItem(updateResponse.body.data);
      expect(updateResponse.body.data.name).toBe('New Name');

      const updatedStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(updatedStored._created).toEqual(originalStored._created);
      expect(updatedStored._createdBy).toEqual(originalStored._createdBy);
      expect(updatedStored._updated).toBeDefined();
      expect(updatedStored._updatedBy).toEqual(userId);
    });

    it('should reject attempts to tamper with audit properties', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Original Item' });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      expect(itemId).toBeDefined();
      const originalStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);

      const tamperedDate = new Date(2000, 1, 1).toISOString();
      const updateResponse = await testAgent
        .patch(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send({
          name: 'Tampered Item',
          _created: tamperedDate,
          _createdBy: 'hacker',
          _updated: tamperedDate,
          _updatedBy: 'hacker'
        });

      expect(updateResponse.status).toBe(200);
      expectPublicItem(updateResponse.body.data);

      const updatedStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(updatedStored._created).toEqual(originalStored._created);
      expect(updatedStored._createdBy).toEqual(originalStored._createdBy);
      expect(updatedStored._updatedBy).not.toEqual('hacker');
      expect(updatedStored._updatedBy).toEqual(userId);
    });

    it('should omit audit properties when returning lists of items', async () => {
      await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Item 1', value: 10 })
        .expect(201);

      await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Item 2', value: 20 })
        .expect(201);

      const response = await testAgent
        .get('/api/test-items')
        .set('Authorization', authToken)
        .expect(200);

      const items = response.body.data?.entities;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
      items.forEach((item: any) => expectPublicItem(item));
    });

    it('should omit audit properties when getting a single item', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'Single Item', value: 42 });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      expect(itemId).toBeDefined();

      const getResponse = await testAgent
        .get(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken);

      expect(getResponse.status).toBe(200);
      expectPublicItem(getResponse.body.data);

      const stored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(stored._created).toBeDefined();
      expect(stored._createdBy).toBe(userId);
    });
  });

  describe('authentication on ApiController routes', () => {
    it('should return 401 when accessing a secured endpoint without authentication', async () => {
      const response = await testAgent
        .post('/api/test-items')
        .send({ name: 'Unauthorized Item' });

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

      expectPublicItem(createdEntity);
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

      // Try to update with invalid data (convert ID to string for URL)
      const invalidUpdate = {
        name: '', // Empty string should fail validation
        value: 'not a number' // Wrong type
      };

      const response = await testAgent
        .patch(`/api/test-items/${String(itemId)}`)
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

      // Update only the value field (convert ID to string for URL)
      const partialUpdate = {
        value: 200
        // name should remain unchanged
      };

      const response = await testAgent
        .patch(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send(partialUpdate);

      expect(response.status).toBe(200);
      const updatedItem = response.body.data;

      // Verify partial update worked correctly
      expect(updatedItem.name).toBe(originalItem.name); // Unchanged
      expect(updatedItem.value).toBe(200); // Updated
      expectPublicItem(updatedItem);
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
      expectPublicItem(response.body.data);

      const stored = await testItemService.getById(getTestMetaOrgUserContext(), response.body.data._id);
      expect(stored._created).toBeDefined();
      expect(stored._createdBy).toBe(userId);
      expect(stored._updated).toBeUndefined();
      expect(stored._updatedBy).toBeUndefined();
    });

    it('should not allow client to override audit properties on create', async () => {
      const hackDate = new Date(2020, 1, 1).toISOString();

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
      expectPublicItem(response.body.data);

      const stored = await testItemService.getById(getTestMetaOrgUserContext(), response.body.data._id);
      expect(stored._createdBy).not.toEqual('hacker');
      expect(stored._createdBy).toEqual(userId);
      expect(stored._updatedBy).not.toEqual('hacker');
      expect(stored._updatedBy).toBeUndefined();
    });

    it('should update _updated and _updatedBy on update but preserve _created and _createdBy', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'UpdateTest', value: 100 });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      const originalStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);

      await new Promise(resolve => setTimeout(resolve, 100));

      const updateResponse = await testAgent
        .patch(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send({ name: 'Updated Test' });

      expect(updateResponse.status).toBe(200);
      expectPublicItem(updateResponse.body.data);

      const updatedStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(updatedStored._created).toEqual(originalStored._created);
      expect(updatedStored._createdBy).toEqual(originalStored._createdBy);
      expect(updatedStored._updated).toBeDefined();
      expect(updatedStored._updatedBy).toEqual(userId);
    });

    it('should handle full updates (PUT) with proper audit trail', async () => {
      const createResponse = await testAgent
        .post('/api/test-items')
        .set('Authorization', authToken)
        .send({ name: 'PUT Test', value: 50 });

      expect(createResponse.status).toBe(201);
      const itemId = createResponse.body.data._id;
      const originalStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);

      await new Promise(resolve => setTimeout(resolve, 100));

      const updateResponse = await testAgent
        .put(`/api/test-items/${String(itemId)}`)
        .set('Authorization', authToken)
        .send({ name: 'PUT Updated', value: 75 });

      expect(updateResponse.status).toBe(200);
      expectPublicItem(updateResponse.body.data);
      expect(updateResponse.body.data.eventDate).toBeUndefined();
      expect(updateResponse.body.data.name).toBe('PUT Updated');
      expect(updateResponse.body.data.value).toBe(75);

      const updatedStored = await testItemService.getById(getTestMetaOrgUserContext(), itemId);
      expect(updatedStored._created).toEqual(originalStored._created);
      expect(updatedStored._createdBy).toEqual(originalStored._createdBy);
      expect(updatedStored._updated).toBeDefined();
      expect(updatedStored._updatedBy).toEqual(userId);
    });

    it('should handle bulk operations with audit properties', async () => {
      const entities: Partial<ITestItem>[] = [
        { name: 'Bulk Item 1', value: 10, eventDate: new Date() },
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

      responses.forEach((response, index) => {
        expect(response.status).toBe(201);
        const item = response.body.data;
        expect(item.name).toBe(entities[index].name);
        expect(item.value).toBe(entities[index].value);
        expectPublicItem(item);
      });

      const listResponse = await testAgent
        .get('/api/test-items')
        .set('Authorization', authToken);

      expect(listResponse.status).toBe(200);
      const pagedResult = listResponse.body.data;
      expect(pagedResult.entities.length).toBeGreaterThanOrEqual(3);
      pagedResult.entities.forEach((item: any) => expectPublicItem(item));
    });
  });
});

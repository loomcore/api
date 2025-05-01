import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';
import { Db, ObjectId } from 'mongodb';
import { Type } from '@sinclair/typebox';
import { IEntity, IAuditable } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { ApiController } from '../api.controller.js';
import { MultiTenantApiService } from '../../services/multi-tenant-api.service.js';

// Import our test utilities
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';

// Test entity for MultiTenantApiService
interface ITestTenantItem extends IEntity, IAuditable {
  name: string;
  value?: number;
  _orgId?: string;
}

const TestTenantItemSchema = Type.Object({
  name: Type.String(),
  value: Type.Optional(Type.Number()),
  _orgId: Type.Optional(Type.String())
});

// Create model specs with auditable
const TestTenantItemSpec = entityUtils.getModelSpec(TestTenantItemSchema, { isAuditable: true });

// Create a test service that uses MultiTenantApiService
class TestTenantItemService extends MultiTenantApiService<ITestTenantItem> {
  constructor(db: Db) {
    super(db, 'testTenantItems', 'testTenantItem', TestTenantItemSpec);
  }
}

// Create a test controller that uses the MultiTenantApiService
class TestTenantItemController extends ApiController<ITestTenantItem> {
  public testTenantItemService: TestTenantItemService;

  constructor(app: Application, db: Db) {
    const testTenantItemService = new TestTenantItemService(db);
    super('test-tenant-items', app, testTenantItemService, 'testTenantItem', TestTenantItemSpec);

    this.testTenantItemService = testTenantItemService;
  }
}

/**
 * This suite tests the ApiController with a MultiTenantApiService.
 * It focuses on validating proper error handling when userContext is invalid.
 */
describe('ApiController with MultiTenantApiService', () => {
  let db: Db;
  let app: Application;
  let testAgent: any;
  let authToken: string;
  let tenantItemService: TestTenantItemService;
  let tenantItemController: TestTenantItemController;
  let userId: string;

  beforeAll(async () => {
    // Initialize with our test express app
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    db = testSetup.db;
    testAgent = testSetup.agent;

    await testUtils.setupTestUser();
    
    // Get auth token and user ID from testUtils
    authToken = testUtils.getAuthToken();
    userId = testUtils.testUserId;
    
    // Create service and controller instances
    tenantItemController = new TestTenantItemController(app, db);
    tenantItemService = tenantItemController.testTenantItemService;

    await TestExpressApp.setupErrorHandling(); // needs to come after all controllers are created
  });

  afterAll(async () => {
    await TestExpressApp.clearCollections();
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    
  });

  // todo: to make this fail (change _orgId back to orgId in auth.controller line 62), and change the test to ACTUALLY call login endpoint first
  //  then use the token that comes back to make the next get request
  describe('proper handling of userContext', () => {
    it('should succeed with valid userContext containing orgId', async () => {
      const authorizationHeaderValue = await testUtils.simulateloginWithTestUser();

      // This should succeed because the authToken from testUtils includes orgId
      const response = await testAgent
        .get('/api/test-tenant-items')
        .set('Authorization', authorizationHeaderValue);
      
      // Test passes if the request succeeds (no error about missing orgId)
      expect(response.status).toBe(200);
    });
    
  });
}); 
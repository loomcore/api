import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Application } from 'express';
import { Type } from '@sinclair/typebox';
import { IEntity, IAuditable } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { ApiController } from '../api.controller.js';
import { MultiTenantApiService } from '../../services/multi-tenant-api.service.js';

// Import our test utilities
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { IDatabase } from '../../databases/models/index.js';
import { getTestMetaOrgUser } from '../../__tests__/test-objects.js';
import { ITestItem, TestItemSpec } from '../../__tests__/models/test-item.model.js';

// Create a test service that uses MultiTenantApiService
class TestItemService extends MultiTenantApiService<ITestItem> {
  constructor(database: IDatabase) {
    super(database, 'testItems', 'testItem', TestItemSpec);
  }
}

// Create a test controller that uses the MultiTenantApiService
class TestItemController extends ApiController<ITestItem> {
  public testItemService: TestItemService;

  constructor(app: Application, database: IDatabase) {
    const testItemService = new TestItemService(database);
    super('test-items', app, testItemService, 'testItem', TestItemSpec);

    this.testItemService = testItemService;
  }
}

/**
 * This suite tests the ApiController with a MultiTenantApiService.
 * It focuses on validating proper error handling when userContext is invalid.
 */
describe('ApiController with MultiTenantApiService', () => {
  let database: IDatabase;
  let app: Application;
  let testAgent: any;
  let authToken: string;
  let testItemService: TestItemService;
  let testItemController: TestItemController;
  let userId: string;

  beforeAll(async () => {
    // Initialize with our test express app
    const testSetup = await TestExpressApp.init();
    app = testSetup.app;
    database = testSetup.database;
    testAgent = testSetup.agent;

    await testUtils.setupTestUser();

    // Get auth token and user ID from testUtils
    authToken = testUtils.getAuthToken();
    userId = getTestMetaOrgUser()._id;

    // Create service and controller instances
    testItemController = new TestItemController(app, database);
    testItemService = testItemController.testItemService;

    await TestExpressApp.setupErrorHandling(); // needs to come after all controllers are created
  });

  afterAll(async () => {
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
        .get('/api/test-items')
        .set('Authorization', authorizationHeaderValue);

      // Test passes if the request succeeds (no error about missing orgId)
      expect(response.status).toBe(200);
    });

  });
});


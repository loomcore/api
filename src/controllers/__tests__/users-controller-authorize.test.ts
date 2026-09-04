import type { IUser } from '@loomcore/common/models';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { getTestMetaOrgUser, getTestOrgUser } from '../../__tests__/test-objects.js';
import { AuthController } from '../auth.controller.js';
import { UsersController } from '../users.controller.js';

describe('UsersController authorization', () => {
  const apiEndpoint = '/api/users';
  let testAgent: any;
  let nonAdminToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;

    new AuthController(testSetup.app, testSetup.database);
    new UsersController(testSetup.app, testSetup.database);

    await TestExpressApp.setupErrorHandling();
    await testUtils.setupTestUsers();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
    nonAdminToken = await testUtils.loginWithTestUser(testAgent);
    adminToken = testUtils.getAdminAuthToken();
  });

  describe('GET /users', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .get(apiEndpoint)
        .set('Authorization', nonAdminToken);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .get(apiEndpoint)
        .set('Authorization', adminToken);

      expect(response.status).toBe(200);
      expect(response.body?.data?.entities?.length).toBeGreaterThan(0);
    });
  });

  describe('GET /users/all', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/all`)
        .set('Authorization', nonAdminToken);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/all`)
        .set('Authorization', adminToken);

      expect(response.status).toBe(200);
      expect(response.body?.data?.length).toBeGreaterThan(0);
    });
  });

  describe('GET /users/count', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/count`)
        .set('Authorization', nonAdminToken);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/count`)
        .set('Authorization', adminToken);

      expect(response.status).toBe(200);
      expect(response.body?.data).toBeGreaterThan(0);
    });
  });

  describe('GET /users/:id', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/${getTestMetaOrgUser()._id}`)
        .set('Authorization', nonAdminToken);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .get(`${apiEndpoint}/${getTestMetaOrgUser()._id}`)
        .set('Authorization', adminToken);

      expect(response.status).toBe(200);
      expect(response.body?.data?.email).toEqual(getTestMetaOrgUser().email);
      expect(response.body?.data?.password).toBeUndefined();
    });
  });

  describe('POST /users', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .post(apiEndpoint)
        .set('Authorization', nonAdminToken)
        .send({
          _orgId: getTestMetaOrgUser()._orgId,
          email: testUtils.newUser1Email,
          password: testUtils.newUser1Password,
        });

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const uniqueEmail = `admin-created-${Date.now()}@example.com`;
      const newUser: Partial<IUser> = {
        _orgId: getTestMetaOrgUser()._orgId,
        email: uniqueEmail,
        password: testUtils.newUser1Password,
        displayName: 'Admin Created User',
      };

      const response = await testAgent
        .post(apiEndpoint)
        .set('Authorization', adminToken)
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body?.data?.email).toBe(uniqueEmail);
      expect(response.body?.data?.password).toBeUndefined();
      expect(response.body?.data?._id).toBeDefined();
    });
  });

  describe('PATCH /users/:id', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .patch(`${apiEndpoint}/${getTestMetaOrgUser()._id}`)
        .set('Authorization', nonAdminToken)
        .send({ displayName: 'Updated Display Name' });

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .patch(`${apiEndpoint}/${getTestMetaOrgUser()._id}`)
        .set('Authorization', adminToken)
        .send({ displayName: 'Updated Display Name' });

      expect(response.status).toBe(200);
      expect(response.body?.data?.displayName).toEqual('Updated Display Name');
      expect(response.body?.data?.email).toEqual(getTestMetaOrgUser().email);
    });
  });

  describe('PATCH /users/batch', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .patch(`${apiEndpoint}/batch`)
        .set('Authorization', nonAdminToken)
        .send([
          {
            _id: getTestMetaOrgUser()._id,
            displayName: 'Updated Meta Org User',
          },
        ]);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const response = await testAgent
        .patch(`${apiEndpoint}/batch`)
        .set('Authorization', adminToken)
        .send([
          {
            _id: getTestMetaOrgUser()._id,
            displayName: 'Updated Meta Org User',
          },
        ]);

      expect(response.status).toBe(200);
      expect(response.body?.data).toHaveLength(1);
      expect(response.body?.data[0].displayName).toBe('Updated Meta Org User');
    });
  });

  describe('PUT /users/:id', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .put(`${apiEndpoint}/${getTestMetaOrgUser()._id}`)
        .set('Authorization', nonAdminToken)
        .send({
          email: getTestMetaOrgUser().email,
          displayName: 'Full Update',
          password: testUtils.newUser1Password,
        });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should reject non-admin users', async () => {
      const response = await testAgent
        .delete(`${apiEndpoint}/${getTestOrgUser()._id}`)
        .set('Authorization', nonAdminToken);

      expect(response.status).toBe(403);
    });

    it('should allow admin users', async () => {
      const created = await testAgent
        .post(apiEndpoint)
        .set('Authorization', adminToken)
        .send({
          _orgId: getTestMetaOrgUser()._orgId,
          email: 'to-delete@example.com',
          displayName: 'To Delete',
          password: 'password123!',
        });
      expect(created.status).toBe(201);

      const response = await testAgent
        .delete(`${apiEndpoint}/${created.body.data._id}`)
        .set('Authorization', adminToken);

      expect(response.status).toBe(200);

      const getAfterDelete = await testAgent
        .get(`${apiEndpoint}/${created.body.data._id}`)
        .set('Authorization', adminToken);

      expect(getAfterDelete.status).not.toBe(200);
    });
  });
});

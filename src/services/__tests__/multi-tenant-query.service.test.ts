import {
  DefaultQueryOptions,
  EmptyUserContext,
  getSystemUserContext,
  IOrganization,
  IQueryOptions,
  IUserContext,
} from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getTestMetaOrgAdminUserContext,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
  getTestOrg,
  getTestOrgUserContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import { config } from '../../config/base-api-config.js';
import type { IDatabase } from '../../databases/models/index.js';
import { BadRequestError, IdNotFoundError, ServerError } from '../../errors/index.js';
import { GenericQueryService } from '../generic-query-service/generic-query.service.js';
import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { MultiTenantQueryService } from '../multi-tenant-query.service.js';
import { OrganizationService } from '../organization.service.js';

beforeAll(() => {
  initializeTypeBox();
});

describe('MultiTenantQueryService', () => {
  let database: IDatabase;
  let apiService: MultiTenantApiService<TestEntity>;
  let queryService: MultiTenantQueryService<TestEntity>;
  let organizationService: OrganizationService;
  let actualMetaOrg: IOrganization | null = null;
  let actualTestOrg: IOrganization | null = null;

  const metaOrgEntityName = 'Query Meta Org Entity';
  const testOrgEntityName = 'Query Test Org Entity';
  const concurrentMetaEntity1 = 'Query Concurrent Meta 1';
  const concurrentMetaEntity2 = 'Query Concurrent Meta 2';
  const concurrentTestEntity1 = 'Query Concurrent Test 1';
  const concurrentTestEntity2 = 'Query Concurrent Test 2';
  const concurrentTestEntity3 = 'Query Concurrent Test 3';

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;

    apiService = new MultiTenantApiService<TestEntity>(
      setup.database,
      'testEntities',
      'testEntity',
      testModelSpec,
    );
    queryService = new MultiTenantQueryService<TestEntity>(
      setup.database,
      'testEntity',
      'testEntities',
      testModelSpec,
    );
    organizationService = new OrganizationService(setup.database);

    actualMetaOrg = await organizationService.getMetaOrg(
      getTestMetaOrgUserContext(),
    );
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    const systemUserContext = getSystemUserContext();
    await testUtils.createMetaOrg();

    actualMetaOrg = await organizationService.getMetaOrg(EmptyUserContext);
    if (!actualMetaOrg) {
      throw new Error('Meta org not found after createMetaOrg');
    }
    setTestMetaOrgId(actualMetaOrg._id);

    const createdTestOrg = await organizationService.create(
      systemUserContext,
      getTestOrg(),
    );
    if (createdTestOrg) {
      actualTestOrg = createdTestOrg;
      setTestOrgId(createdTestOrg._id);
    }
  });

  async function createInMetaOrg(name: string): Promise<TestEntity> {
    const entity = await apiService.create(getTestMetaOrgUserContext(), { name });
    if (!entity) throw new Error('Failed to create entity in meta org');
    return entity;
  }

  async function createInTestOrg(name: string): Promise<TestEntity> {
    const entity = await apiService.create(getTestOrgUserContext(), { name });
    if (!entity) throw new Error('Failed to create entity in test org');
    return entity;
  }

  function unscopedQueryService(): GenericQueryService<TestEntity> {
    return new GenericQueryService<TestEntity>(database, 'testEntity', 'testEntities', testModelSpec);
  }

  function userContextWithoutOrg(): IUserContext {
    return {
      user: {
        _id: getTestMetaOrgUser()._id,
        externalId: 'test-external-id',
        email: 'test@example.com',
        password: '',
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system',
      },
      features: ['testUser'],
    };
  }

  describe('getAll', () => {
    it('should return only entities in the caller org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await queryService.getAll(getTestMetaOrgUserContext());
      const testOrgResults = await queryService.getAll(getTestOrgUserContext());

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._id).toBe(metaOrgEntity._id);
      expect(metaOrgResults[0].name).toBe(metaOrgEntityName);

      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._id).toBe(testOrgEntity._id);
      expect(testOrgResults[0].name).toBe(testOrgEntityName);
    });

    it('should return empty array when the caller org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);

      const testOrgResults = await queryService.getAll(getTestOrgUserContext());

      expect(testOrgResults).toHaveLength(0);
    });

    it('should isolate interleaved concurrent reads across orgs', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaResults, testResults] = await Promise.all([
        queryService.getAll(getTestMetaOrgUserContext()),
        queryService.getAll(getTestOrgUserContext()),
      ]);

      expect(metaResults).toHaveLength(2);
      expect(metaResults.every(e => e._orgId === actualMetaOrg!._id)).toBe(true);

      expect(testResults).toHaveLength(3);
      expect(testResults.every(e => e._orgId === actualTestOrg!._id)).toBe(true);
    });

    it('should reject getAll when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);

      await expect(queryService.getAll(userContextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should return entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await queryService.getAll(getSystemUserContext());

      expect(results).toHaveLength(2);
    });

    it('should return entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await queryService.getAll(getTestMetaOrgAdminUserContext());

      expect(results).toHaveLength(2);
    });

    it('should return entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        expect(() => new MultiTenantQueryService<TestEntity>(
          database,
          'testEntity',
          'testEntities',
          testModelSpec,
        )).toThrow(ServerError);
        const results = await unscopedQueryService().getAll(getTestOrgUserContext());
        expect(results).toHaveLength(2);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('get', () => {
    it('should return only paginated results from the caller org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await queryService.get(getTestMetaOrgUserContext());
      const testOrgResults = await queryService.get(getTestOrgUserContext());

      expect(metaOrgResults.total).toBe(2);
      expect(metaOrgResults.entities).toHaveLength(2);

      expect(testOrgResults.total).toBe(1);
      expect(testOrgResults.entities).toHaveLength(1);
    });

    it('should apply caller-supplied filters without leaking other orgs', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(metaOrgEntityName);

      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: metaOrgEntityName } },
      };

      const metaOrgResults = await queryService.get(getTestMetaOrgUserContext(), queryOptions);
      const testOrgResults = await queryService.get(getTestOrgUserContext(), queryOptions);

      expect(metaOrgResults.total).toBe(1);
      expect(metaOrgResults.entities).toHaveLength(1);
      expect(metaOrgResults.entities?.[0]._orgId).toBe(actualMetaOrg!._id);

      expect(testOrgResults.total).toBe(1);
      expect(testOrgResults.entities).toHaveLength(1);
      expect(testOrgResults.entities?.[0]._orgId).toBe(actualTestOrg!._id);
    });

    it('should reject get when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);

      await expect(queryService.get(userContextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should return paginated entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await queryService.get(getSystemUserContext());

      expect(results.total).toBe(2);
      expect(results.entities).toHaveLength(2);
    });

    it('should return paginated entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await queryService.get(getTestMetaOrgAdminUserContext());

      expect(results.total).toBe(2);
      expect(results.entities).toHaveLength(2);
    });

    it('should return paginated entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        expect(() => new MultiTenantQueryService<TestEntity>(
          database,
          'testEntity',
          'testEntities',
          testModelSpec,
        )).toThrow(ServerError);
        const results = await unscopedQueryService().get(getTestOrgUserContext());
        expect(results.total).toBe(2);
        expect(results.entities).toHaveLength(2);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('getById', () => {
    it('should not allow getting an entity from another org by ID', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        queryService.getById(getTestOrgUserContext(), metaOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should allow getting an entity from the same org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const result = await queryService.getById(getTestOrgUserContext(), testOrgEntity._id);

      expect(result).toBeDefined();
      expect(result._id).toBe(testOrgEntity._id);
      expect(result._orgId).toBe(actualTestOrg!._id);
    });

    it('should reject getById when userContext has no _orgId', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        queryService.getById(userContextWithoutOrg(), metaOrgEntity._id),
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow a system user to get an entity from any org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const result = await queryService.getById(getSystemUserContext(), testOrgEntity._id);

      expect(result._id).toBe(testOrgEntity._id);
    });

    it('should allow a meta org admin to get an entity from any org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const result = await queryService.getById(getTestMetaOrgAdminUserContext(), testOrgEntity._id);

      expect(result._id).toBe(testOrgEntity._id);
    });

    it('should allow getting an entity from another org by ID when multi-tenant mode is disabled', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        expect(() => new MultiTenantQueryService<TestEntity>(
          database,
          'testEntity',
          'testEntities',
          testModelSpec,
        )).toThrow(ServerError);
        const result = await unscopedQueryService().getById(getTestOrgUserContext(), metaOrgEntity._id);
        expect(result._id).toBe(metaOrgEntity._id);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('getCount', () => {
    it('should only count entities in the caller org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      const metaOrgCount = await queryService.getCount(getTestMetaOrgUserContext());
      const testOrgCount = await queryService.getCount(getTestOrgUserContext());

      expect(metaOrgCount).toBe(2);
      expect(testOrgCount).toBe(1);
    });

    it('should return zero when the caller org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);

      const testOrgCount = await queryService.getCount(getTestOrgUserContext());

      expect(testOrgCount).toBe(0);
    });

    it('should isolate counts during concurrent operations', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaCount, testCount, metaAll, testAll] = await Promise.all([
        queryService.getCount(getTestMetaOrgUserContext()),
        queryService.getCount(getTestOrgUserContext()),
        queryService.getAll(getTestMetaOrgUserContext()),
        queryService.getAll(getTestOrgUserContext()),
      ]);

      expect(metaCount).toBe(2);
      expect(testCount).toBe(3);
      expect(metaAll).toHaveLength(2);
      expect(testAll).toHaveLength(3);
    });

    it('should reject getCount when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);

      await expect(queryService.getCount(userContextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should count entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const count = await queryService.getCount(getSystemUserContext());

      expect(count).toBe(2);
    });

    it('should count entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const count = await queryService.getCount(getTestMetaOrgAdminUserContext());

      expect(count).toBe(2);
    });

    it('should count entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        expect(() => new MultiTenantQueryService<TestEntity>(
          database,
          'testEntity',
          'testEntities',
          testModelSpec,
        )).toThrow(ServerError);
        const count = await unscopedQueryService().getCount(getTestOrgUserContext());
        expect(count).toBe(2);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });
});

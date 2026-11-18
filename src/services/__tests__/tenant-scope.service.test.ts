import {
  DefaultQueryOptions,
  EmptyUserContext,
  type IOrganization,
  type IQueryOptions,
  type IUserContext,
} from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { initializeTypeBox } from '@loomcore/common/validation';
import { Type } from '@sinclair/typebox';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestEntity, testModelSpec } from '../../__tests__/index.js';
import { ITestItem, TestItemSpec } from '../../__tests__/models/test-item.model.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getSystemContext,
  getTestMetaOrg,
  getTestMetaOrgAdminContext,
  getTestMetaOrgContext,
  getTestMetaOrgUser,
  getTestOrg,
  getTestOrgContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import { config } from '../../config/base-api-config.js';
import type { IDatabase } from '../../databases/models/index.js';
import { BadRequestError, IdNotFoundError } from '../../errors/index.js';
import { GenericApiService } from '../generic-api-service/generic-api.service.js';
import { OrganizationService } from '../organization.service.js';
import { TenantScope } from '../tenant-scope.js';
import type { IRequestContext } from '../request-context.interface.js';
import type { CustomProcessEntityAfterReadFunction, PrepareQueryCustomFunction } from '../types.js';

beforeAll(() => {
  initializeTypeBox();
});

/**
 * TenantScope behavior via GenericApiService in multi-tenant config.
 * Isolation is applied automatically when config.app.isMultiTenant and tenancy is 'isolated'.
 */
describe('TenantScope via GenericApiService', () => {
  let database: IDatabase;
  let service: GenericApiService<TestEntity>;
  let organizationService: OrganizationService;
  let actualMetaOrg: IOrganization | null = null;
  let actualTestOrg: IOrganization | null = null;

  const metaOrgEntityName = 'Meta Org Test Entity';
  const testOrgEntityName = 'Test Org Test Entity';
  const sharedEntityName = 'Shared Entity Name';
  const attackName = 'Attempted Cross-Org Update';
  const updatedMetaName = 'Updated Meta Entity';
  const updatedTestName = 'Updated Test Entity';

  // Fixture entity names for concurrent context isolation tests
  const concurrentMetaEntity1 = 'Concurrent Meta Entity 1';
  const concurrentMetaEntity2 = 'Concurrent Meta Entity 2';
  const concurrentTestEntity1 = 'Concurrent Test Entity 1';
  const concurrentTestEntity2 = 'Concurrent Test Entity 2';
  const concurrentTestEntity3 = 'Concurrent Test Entity 3';
  const concurrentMetaOriginal = 'Concurrent Meta Original';
  const concurrentTestOriginal = 'Concurrent Test Original';
  const concurrentMetaUpdated = 'Concurrent Meta Updated';
  const concurrentTestUpdated = 'Concurrent Test Updated';
  const concurrentMetaProtected = 'Concurrent Meta Protected';
  const concurrentTestProtected = 'Concurrent Test Protected';
  const concurrentMetaToDelete = 'Concurrent Meta To Delete';
  const concurrentTestToDelete = 'Concurrent Test To Delete';
  const concurrentMetaToKeep = 'Concurrent Meta To Keep';
  const concurrentTestToKeep = 'Concurrent Test To Keep';

  const otherOrgId = '000000000000000000000099';

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
    service = new GenericApiService<TestEntity>(
      setup.database,
      'testEntity',
      'testEntities',
      testModelSpec,
    );
    organizationService = new OrganizationService(setup.database);
    actualMetaOrg = await organizationService.getMetaOrg(getTestMetaOrgContext());
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.createMetaOrg();

    actualMetaOrg = await organizationService.getMetaOrg({ userContext: EmptyUserContext });
    if (!actualMetaOrg) {
      throw new Error('Meta org not found after createMetaOrg');
    }
    setTestMetaOrgId(actualMetaOrg._id);

    const createdTestOrg = await organizationService.create(getSystemContext(), getTestOrg());
    if (createdTestOrg) {
      actualTestOrg = createdTestOrg;
      setTestOrgId(createdTestOrg._id);
    }
  });

  async function createInMetaOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(getTestMetaOrgContext(), { name });
    if (!entity) throw new Error('Failed to create entity in meta org');
    return entity;
  }

  async function createInTestOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(getTestOrgContext(), { name });
    if (!entity) throw new Error('Failed to create entity in test org');
    return entity;
  }

  function buildUpdateEntity(existingEntity: TestEntity, updates: Partial<TestEntity>): TestEntity {
    return {
      _id: existingEntity._id,
      _orgId: existingEntity._orgId,
      _created: existingEntity._created,
      _createdBy: existingEntity._createdBy,
      name: existingEntity.name,
      ...updates,
    };
  }

  function contextWithoutOrg(): IRequestContext {
    const userContext: IUserContext = {
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
    return { userContext };
  }

  describe('getFilters', () => {
    it('should scope tenant users to their _orgId', () => {
      const scope = new TenantScope();
      const filters = scope.getFilters(getTestOrgContext());
      expect(filters).toEqual({ _orgId: { eq: getTestOrgContext().userContext.user._orgId } });
    });

    it('should return empty filters for system users', () => {
      const scope = new TenantScope();
      expect(scope.getFilters(getSystemContext())).toEqual({});
    });

    it('should return empty filters for meta-org admins', () => {
      const scope = new TenantScope();
      expect(scope.getFilters(getTestMetaOrgAdminContext())).toEqual({});
    });

    it('should throw BadRequestError when tenant user has no _orgId', () => {
      const scope = new TenantScope();
      expect(() => scope.getFilters(contextWithoutOrg())).toThrow(BadRequestError);
    });
  });

  describe('applyToEntity', () => {
    it('should stamp _orgId on create for tenant users', () => {
      const scope = new TenantScope();
      const entity: Partial<TestEntity> = { name: 'Scoped' };
      scope.applyToEntity(getTestOrgContext(), entity, true);
      expect(entity._orgId).toBe(getTestOrgContext().userContext.user._orgId);
    });

    it('should overwrite _orgId on update for tenant users', () => {
      const scope = new TenantScope();
      const entity: Partial<TestEntity> = { name: 'Move attempt', _orgId: actualMetaOrg!._id };
      scope.applyToEntity(getTestOrgContext(), entity, false);
      expect(entity._orgId).toBe(getTestOrgContext().userContext.user._orgId);
    });

    it('should leave supplied _orgId for system users', () => {
      const scope = new TenantScope();
      const entity: Partial<TestEntity> = { name: 'System', _orgId: actualTestOrg!._id };
      scope.applyToEntity(getSystemContext(), entity, true);
      expect(entity._orgId).toBe(actualTestOrg!._id);
    });

    it('should default meta-org admin creates to their own org when _orgId omitted', () => {
      const scope = new TenantScope();
      const entity: Partial<TestEntity> = { name: 'Admin create' };
      scope.applyToEntity(getTestMetaOrgAdminContext(), entity, true);
      expect(entity._orgId).toBe(getTestMetaOrgAdminContext().userContext.user._orgId);
    });
  });

  // Adapted from multi-tenant-api prepareQuery / prepareQueryOptions / prepareEntity:
  // TenantScope filters are merged in buildQuery (after prepareQuery), not inside prepareQuery itself.
  describe('buildQuery (TenantScope filter merge)', () => {
    it('should apply TenantScope _orgId filters via buildQuery', () => {
      const query: IQueryOptions = { ...DefaultQueryOptions, filters: { name: { eq: 'Test' } } };
      const result = (service as any).buildQuery(getTestMetaOrgContext(), query, []);
      expect(result.queryOptions.filters!['name']).toEqual({ eq: 'Test' });
      expect(result.queryOptions.filters!['_orgId']).toEqual({
        eq: getTestMetaOrgContext().userContext.user._orgId,
      });
    });

    it('should throw BadRequestError if context has no _orgId when building a scoped query', () => {
      const query: IQueryOptions = { ...DefaultQueryOptions };
      expect(() => (service as any).buildQuery(contextWithoutOrg(), query, [])).toThrow(BadRequestError);
    });

    it('should override consumer-supplied _orgId with userContext _orgId', () => {
      const query: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } },
      };
      const result = (service as any).buildQuery(getTestMetaOrgContext(), query, []);
      expect(result.queryOptions.filters!['_orgId']).toEqual({
        eq: getTestMetaOrgContext().userContext.user._orgId,
      });
      expect(result.queryOptions.filters!['_orgId']).not.toEqual({ eq: otherOrgId });
    });
  });

  describe('preProcessEntity (tenant stamp)', () => {
    it('should add tenant ID to entity', async () => {
      const result = await service.preProcessEntity(
        getTestMetaOrgContext(),
        testModelSpec,
        { name: 'Test Entity' },
        true,
      );
      expect(result).toHaveProperty('_orgId', getTestMetaOrg()._id);
    });

    it('should throw BadRequestError if userContext has no _orgId', async () => {
      await expect(
        service.preProcessEntity(contextWithoutOrg(), testModelSpec, { name: 'Test Entity' }, true),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('getAll', () => {
    it('should call prepareQuery and return entities', async () => {
      await service.create(getTestMetaOrgContext(), { name: 'Test Entity' });
      const spy = vi.spyOn(service as any, 'prepareQuery');
      const result = await service.getAll(getTestMetaOrgContext());
      expect(spy).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      spy.mockRestore();
    });

    it('should return only entities in the caller\'s org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await service.getAll(getTestMetaOrgContext());
      const testOrgResults = await service.getAll(getTestOrgContext());

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._id).toBe(metaOrgEntity._id);
      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._id).toBe(testOrgEntity._id);
    });

    it('should return empty array when the caller\'s org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);
      expect(await service.getAll(getTestOrgContext())).toHaveLength(0);
    });

    it('should isolate interleaved concurrent reads across orgs', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaResults, testResults] = await Promise.all([
        service.getAll(getTestMetaOrgContext()),
        service.getAll(getTestOrgContext()),
      ]);

      expect(metaResults).toHaveLength(2);
      expect(metaResults.every(e => e._orgId === actualMetaOrg!._id)).toBe(true);
      expect(testResults).toHaveLength(3);
      expect(testResults.every(e => e._orgId === actualTestOrg!._id)).toBe(true);
    });

    it('should apply custom prepare and post-process callbacks while remaining scoped to the caller org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      interface TestEntityWithLabel extends TestEntity {
        label: string;
      }

      let prepareCalled = false;
      const prepareQueryCustom: PrepareQueryCustomFunction = (context, queryOptions, operations) => {
        prepareCalled = true;
        return { queryOptions, operations };
      };
      const postProcessEntityCustom: CustomProcessEntityAfterReadFunction<TestEntity, TestEntityWithLabel> = (
        _context,
        entity,
      ) => {
        return {
          ...entity,
          label: `labeled:${entity.name}`,
        };
      };

      const results = await service.getAll<TestEntityWithLabel>(
        getTestMetaOrgContext(),
        prepareQueryCustom,
        postProcessEntityCustom,
      );

      expect(prepareCalled).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0]._id).toBe(metaOrgEntity._id);
      expect(results[0].name).toBe(metaOrgEntityName);
      expect(results[0].label).toBe(`labeled:${metaOrgEntityName}`);
    });

    it('should reject getAll when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await expect(service.getAll(contextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should return entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      expect(await service.getAll(getSystemContext())).toHaveLength(2);
    });

    it('should return entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      expect(await service.getAll(getTestMetaOrgAdminContext())).toHaveLength(2);
    });

    it('should return entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        const results = await service.getAll(getTestOrgContext());
        expect(results).toHaveLength(2);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('get', () => {
    it('should call prepareQueryOptions with the provided options', async () => {
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } },
      };
      const result = await service.get(getTestMetaOrgContext(), queryOptions);
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should return only paginated results from the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await service.get(getTestMetaOrgContext());
      const testOrgResults = await service.get(getTestOrgContext());

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

      const metaOrgResults = await service.get(getTestMetaOrgContext(), queryOptions);
      const testOrgResults = await service.get(getTestOrgContext(), queryOptions);

      expect(metaOrgResults.total).toBe(1);
      expect(metaOrgResults.entities).toHaveLength(1);
      expect(metaOrgResults.entities?.[0]._orgId).toBe(actualMetaOrg!._id);

      expect(testOrgResults.total).toBe(1);
      expect(testOrgResults.entities).toHaveLength(1);
      expect(testOrgResults.entities?.[0]._orgId).toBe(actualTestOrg!._id);
    });

    it('should reject get when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await expect(service.get(contextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should return paginated entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      const results = await service.get(getSystemContext());
      expect(results.total).toBe(2);
      expect(results.entities).toHaveLength(2);
    });

    it('should return paginated entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      const results = await service.get(getTestMetaOrgAdminContext());
      expect(results.total).toBe(2);
      expect(results.entities).toHaveLength(2);
    });

    it('should return paginated entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        const results = await service.get(getTestOrgContext());
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
      await expect(service.getById(getTestOrgContext(), metaOrgEntity._id)).rejects.toThrow(IdNotFoundError);
    });

    it('should allow getting an entity from the same org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const result = await service.getById(getTestOrgContext(), testOrgEntity._id);
      expect(result._id).toBe(testOrgEntity._id);
      expect(result._orgId).toBe(actualTestOrg!._id);
    });

    it('should reject getById when userContext has no _orgId', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await expect(service.getById(contextWithoutOrg(), metaOrgEntity._id)).rejects.toThrow(BadRequestError);
    });

    it('should allow a system user to get an entity from any org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const result = await service.getById(getSystemContext(), testOrgEntity._id);
      expect(result._id).toBe(testOrgEntity._id);
    });

    it('should allow a meta org admin to get an entity from any org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const result = await service.getById(getTestMetaOrgAdminContext(), testOrgEntity._id);
      expect(result._id).toBe(testOrgEntity._id);
    });

    it('should allow getting an entity from another org by ID when multi-tenant mode is disabled', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        const result = await service.getById(getTestOrgContext(), metaOrgEntity._id);
        expect(result._id).toBe(metaOrgEntity._id);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('getCount', () => {
    it('should only count entities in the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      expect(await service.getCount(getTestMetaOrgContext())).toBe(2);
      expect(await service.getCount(getTestOrgContext())).toBe(1);
    });

    it('should return zero when the caller\'s org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);
      expect(await service.getCount(getTestOrgContext())).toBe(0);
    });

    it('should isolate counts during concurrent operations', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaCount, testCount, metaAll, testAll] = await Promise.all([
        service.getCount(getTestMetaOrgContext()),
        service.getCount(getTestOrgContext()),
        service.getAll(getTestMetaOrgContext()),
        service.getAll(getTestOrgContext()),
      ]);

      expect(metaCount).toBe(2);
      expect(testCount).toBe(3);
      expect(metaAll).toHaveLength(2);
      expect(testAll).toHaveLength(3);
    });

    it('should reject getCount when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await expect(service.getCount(contextWithoutOrg())).rejects.toThrow(BadRequestError);
    });

    it('should count entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      expect(await service.getCount(getSystemContext())).toBe(2);
    });

    it('should count entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);
      expect(await service.getCount(getTestMetaOrgAdminContext())).toBe(2);
    });

    it('should count entities from all orgs when multi-tenant mode is disabled', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const originalIsMultiTenant = config.app.isMultiTenant;
      config.app.isMultiTenant = false;
      try {
        expect(await service.getCount(getTestOrgContext())).toBe(2);
      } finally {
        config.app.isMultiTenant = originalIsMultiTenant;
      }
    });
  });

  describe('create', () => {
    it('should create an entity with tenant ID', async () => {
      const created = await service.create(getTestMetaOrgContext(), { name: 'Test Entity' });
      expect(created).toBeDefined();
      expect(created?._orgId).toBe(actualMetaOrg!._id);

      const dbEntity = await service.getById(getTestMetaOrgContext(), created!._id);
      expect(dbEntity._orgId).toBe(actualMetaOrg!._id);
    });
  });

  describe('partialUpdateById', () => {
    it('should update an entity by ID within the same org', async () => {
      const created = await service.create(getTestMetaOrgContext(), { name: 'Original Name' });
      const updated = await service.partialUpdateById(
        getTestMetaOrgContext(),
        created!._id,
        { name: updatedMetaName },
      );
      expect(updated.name).toBe(updatedMetaName);
      expect(updated._orgId).toBe(actualMetaOrg!._id);
    });

    it('should throw IdNotFoundError if entity not found', async () => {
      const isPostgres = process.env.TEST_DATABASE === 'postgres';
      const nonExistentId = isPostgres ? 999999 : '507f1f77bcf86cd799439011';
      await expect(
        service.partialUpdateById(getTestMetaOrgContext(), nonExistentId, { name: updatedMetaName }),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should not allow updating an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await expect(
        service.partialUpdateById(getTestOrgContext(), metaOrgEntity._id, { name: attackName }),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(getTestMetaOrgContext(), metaOrgEntity._id);
      expect(unchanged.name).toBe(metaOrgEntityName);
    });

    it('should isolate interleaved concurrent mutations across orgs', async () => {
      const metaEntity = await createInMetaOrg(concurrentMetaOriginal);
      const testEntity = await createInTestOrg(concurrentTestOriginal);

      const [metaUpdated, testUpdated] = await Promise.all([
        service.partialUpdateById(getTestMetaOrgContext(), metaEntity._id, { name: concurrentMetaUpdated }),
        service.partialUpdateById(getTestOrgContext(), testEntity._id, { name: concurrentTestUpdated }),
      ]);

      expect(metaUpdated.name).toBe(concurrentMetaUpdated);
      expect(metaUpdated._orgId).toBe(actualMetaOrg!._id);
      expect(testUpdated.name).toBe(concurrentTestUpdated);
      expect(testUpdated._orgId).toBe(actualTestOrg!._id);

      const metaVerify = await service.getById(getTestMetaOrgContext(), metaEntity._id);
      const testVerify = await service.getById(getTestOrgContext(), testEntity._id);
      expect(metaVerify.name).toBe(concurrentMetaUpdated);
      expect(testVerify.name).toBe(concurrentTestUpdated);
    });

    it('should reject cross-org access during concurrent operations', async () => {
      const metaEntity = await createInMetaOrg(concurrentMetaProtected);
      const testEntity = await createInTestOrg(concurrentTestProtected);

      const results = await Promise.allSettled([
        service.getById(getTestOrgContext(), metaEntity._id),
        service.getById(getTestMetaOrgContext(), testEntity._id),
        service.partialUpdateById(getTestOrgContext(), metaEntity._id, { name: attackName }),
        service.partialUpdateById(getTestMetaOrgContext(), testEntity._id, { name: attackName }),
      ]);

      expect(results.every(r => r.status === 'rejected')).toBe(true);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(IdNotFoundError);
        }
      }

      const metaVerify = await service.getById(getTestMetaOrgContext(), metaEntity._id);
      const testVerify = await service.getById(getTestOrgContext(), testEntity._id);
      expect(metaVerify.name).toBe(concurrentMetaProtected);
      expect(testVerify.name).toBe(concurrentTestProtected);
    });

    it('should not allow changing _orgId via partialUpdateById', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const updated = await service.partialUpdateById(
        getTestOrgContext(),
        testOrgEntity._id,
        { name: updatedTestName, _orgId: actualMetaOrg!._id } as Partial<TestEntity>,
      );
      expect(updated._orgId).toBe(actualTestOrg!._id);
      expect(updated.name).toBe(updatedTestName);
    });
  });

  describe('fullUpdateById', () => {
    it('should not allow full update of an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const attackPayload = buildUpdateEntity(metaOrgEntity, { name: attackName });
      await expect(
        service.fullUpdateById(getTestOrgContext(), metaOrgEntity._id, attackPayload),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should allow full update of an entity in the same org', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const updatePayload = buildUpdateEntity(testOrgEntity, { name: updatedTestName });
      const updated = await service.fullUpdateById(
        getTestOrgContext(),
        testOrgEntity._id,
        updatePayload,
      );
      expect(updated.name).toBe(updatedTestName);
      expect(updated._orgId).toBe(actualTestOrg!._id);
    });

    it('should not allow changing _orgId via fullUpdateById', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const updatePayload = buildUpdateEntity(testOrgEntity, {
        name: updatedTestName,
        _orgId: actualMetaOrg!._id,
      });
      const updated = await service.fullUpdateById(
        getTestOrgContext(),
        testOrgEntity._id,
        updatePayload,
      );
      expect(updated._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('update', () => {
    it('should not allow changing _orgId via update', async () => {
      const created = await createInTestOrg(testOrgEntityName);
      await service.update(
        getTestOrgContext(),
        { filters: { name: { eq: testOrgEntityName } } },
        { name: updatedTestName, _orgId: actualMetaOrg!._id } as Partial<TestEntity>,
      );
      const verified = await service.getById(getTestOrgContext(), created._id);
      expect(verified._orgId).toBe(actualTestOrg!._id);
      expect(verified.name).toBe(updatedTestName);
    });

    it('should only update entities in the caller\'s org based on query', async () => {
      await createInMetaOrg(sharedEntityName);
      await createInTestOrg(sharedEntityName);

      const queryOptions: IQueryOptions = { filters: { name: { eq: sharedEntityName } } };
      const updatedEntities = await service.update(
        getTestMetaOrgContext(),
        queryOptions,
        { description: 'Updated description' },
      );

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._orgId).toBe(actualMetaOrg!._id);

      const testOrgEntity = await service.findOne(getTestOrgContext(), {
        filters: { name: { eq: sharedEntityName } },
      });
      expect(testOrgEntity?.description).toBeUndefined();
    });
  });

  describe('batchUpdate', () => {
    it('should not allow changing _orgId via batchUpdate', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const updated = await service.batchUpdate(getTestOrgContext(), [
        {
          _id: testOrgEntity._id,
          name: updatedTestName,
          _orgId: actualMetaOrg!._id,
        } as Partial<TestEntity>,
      ]);
      expect(updated).toHaveLength(1);
      expect(updated[0]._orgId).toBe(actualTestOrg!._id);
    });

    it('should only update entities in the caller\'s org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const batchUpdates: Partial<TestEntity>[] = [
        { _id: metaOrgEntity._id, name: updatedMetaName },
        { _id: testOrgEntity._id, name: updatedTestName },
      ];

      const updatedEntities = await service.batchUpdate(getTestMetaOrgContext(), batchUpdates);

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBe(metaOrgEntity._id);
      expect(updatedEntities[0].name).toBe(updatedMetaName);

      const unchangedTestEntity = await service.getById(getTestOrgContext(), testOrgEntity._id);
      expect(unchangedTestEntity.name).toBe(testOrgEntityName);
    });
  });

  describe('deleteById', () => {
    it('should delete an entity by ID in the same org', async () => {
      const created = await service.create(getTestMetaOrgContext(), { name: 'Test Entity' });
      const deleteResult = await service.deleteById(getTestMetaOrgContext(), created!._id);
      expect(deleteResult.count).toBe(1);
      await expect(service.getById(getTestMetaOrgContext(), created!._id)).rejects.toThrow(IdNotFoundError);
    });

    it('should throw IdNotFoundError if no entity found', async () => {
      const isPostgres = process.env.TEST_DATABASE === 'postgres';
      const nonExistentId = isPostgres ? 999999 : '507f1f77bcf86cd799439011';
      await expect(service.deleteById(getTestMetaOrgContext(), nonExistentId)).rejects.toThrow(IdNotFoundError);
    });

    it('should not allow deleting an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await expect(service.deleteById(getTestOrgContext(), metaOrgEntity._id)).rejects.toThrow(IdNotFoundError);
      const stillThere = await service.getById(getTestMetaOrgContext(), metaOrgEntity._id);
      expect(stillThere.name).toBe(metaOrgEntityName);
    });

    it('should isolate deletes during concurrent operations', async () => {
      const metaToDelete = await createInMetaOrg(concurrentMetaToDelete);
      const testToDelete = await createInTestOrg(concurrentTestToDelete);
      const metaToKeep = await createInMetaOrg(concurrentMetaToKeep);
      const testToKeep = await createInTestOrg(concurrentTestToKeep);

      const [metaDelete, testDelete] = await Promise.all([
        service.deleteById(getTestMetaOrgContext(), metaToDelete._id),
        service.deleteById(getTestOrgContext(), testToDelete._id),
      ]);

      expect(metaDelete.count).toBe(1);
      expect(testDelete.count).toBe(1);

      const metaRemaining = await service.getAll(getTestMetaOrgContext());
      const testRemaining = await service.getAll(getTestOrgContext());

      expect(metaRemaining).toHaveLength(1);
      expect(metaRemaining[0]._id).toBe(metaToKeep._id);
      expect(testRemaining).toHaveLength(1);
      expect(testRemaining[0]._id).toBe(testToKeep._id);
    });
  });

  describe('deleteMany', () => {
    it('should only delete entities in the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const result = await service.deleteMany(getTestOrgContext(), {
        filters: { name: { eq: testOrgEntityName } },
      });
      expect(result.count).toBe(1);
      expect(await service.getAll(getTestMetaOrgContext())).toHaveLength(1);
      expect(await service.getAll(getTestOrgContext())).toHaveLength(0);
    });

    it('should only delete entities in the caller\'s org with an empty filter', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const deleteResult = await service.deleteMany(getTestMetaOrgContext(), {});
      expect(deleteResult.count).toBe(1);
      expect(await service.getAll(getTestOrgContext())).toHaveLength(1);
    });
  });

  describe('find', () => {
    it('should only find entities in the caller\'s org', async () => {
      await createInMetaOrg(sharedEntityName);
      await createInTestOrg(sharedEntityName);

      const metaOrgResults = await service.find(getTestMetaOrgContext(), {
        filters: { name: { eq: sharedEntityName } },
      });
      const testOrgResults = await service.find(getTestOrgContext(), {
        filters: { name: { eq: sharedEntityName } },
      });

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._orgId).toBe(actualMetaOrg!._id);
      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('findOne', () => {
    it('should only find one entity in the caller\'s org', async () => {
      const metaOrgEntity = await createInMetaOrg(sharedEntityName);
      const testOrgEntity = await createInTestOrg(sharedEntityName);

      const metaOrgResult = await service.findOne(getTestMetaOrgContext(), {
        filters: { name: { eq: sharedEntityName } },
      });
      const testOrgResult = await service.findOne(getTestOrgContext(), {
        filters: { name: { eq: sharedEntityName } },
      });

      expect(metaOrgResult).toBeDefined();
      expect(metaOrgResult?._id).toBe(metaOrgEntity._id);
      expect(metaOrgResult?._orgId).toBe(actualMetaOrg!._id);
      expect(testOrgResult).toBeDefined();
      expect(testOrgResult?._id).toBe(testOrgEntity._id);
      expect(testOrgResult?._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('resolveModelSpec / create with override spec', () => {
    const baseItemSpec = entityUtils.getModelSpec(
      Type.Object({
        name: Type.String(),
        value: Type.Optional(Type.Number()),
        notes: Type.Optional(Type.String()),
      }),
      { isAuditable: true },
    );

    class OverrideModelSpecTenantService extends GenericApiService<ITestItem> {
      constructor(db: IDatabase) {
        super(db, 'testItem', 'testItems', baseItemSpec);
        this.modelSpecResolver = {
          resolve: async () => TestItemSpec,
        };
      }
    }

    it('should decode with a subclass override spec and enforce _orgId', async () => {
      const overrideService = new OverrideModelSpecTenantService(database);
      const isoDateString = new Date().toISOString();

      const createdEntity = await overrideService.create(getTestMetaOrgContext(), {
        name: 'Multi-tenant override spec item',
        value: 5,
        notes: 'only on constructor spec',
        eventDate: isoDateString as any,
        extraProperty: 'should be stripped',
      } as any);

      expect(createdEntity).toBeDefined();
      expect(createdEntity!._orgId).toBe(getTestMetaOrg()._id);
      expect(createdEntity!.name).toBe('Multi-tenant override spec item');
      expect(createdEntity!.value).toBe(5);
      expect(createdEntity!.eventDate instanceof Date).toBe(true);
      expect(createdEntity!.eventDate!.toISOString()).toBe(isoDateString);
      expect((createdEntity as any).notes).toBeUndefined();
      expect((createdEntity as any).extraProperty).toBeUndefined();
    });
  });
});

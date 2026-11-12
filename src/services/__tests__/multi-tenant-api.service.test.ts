import {
  DefaultQueryOptions,
  EmptyUserContext,
  getSystemUserContext,
  IModelSpec,
  IOrganization,
  IQueryOptions,
  IUserContext,
} from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';
import { entityUtils } from '@loomcore/common/utils';
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
  getTestMetaOrg,
  getTestMetaOrgAdminUserContext,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
  getTestOrg,
  getTestOrgUserContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import type { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../types.js';
import { BadRequestError, IdNotFoundError } from '../../errors/index.js';
import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import type { IDatabase } from '../../databases/models/index.js';
import { OrganizationService } from '../organization.service.js';
import { TenantQueryDecorator } from '../tenant-query-decorator.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
  initializeTypeBox();
});

describe('MultiTenantApiService', () => {
  let database: IDatabase;
  let service: MultiTenantApiService<TestEntity>;
  let organizationService: OrganizationService;
  let actualMetaOrg: IOrganization | null = null;
  let actualTestOrg: IOrganization | null = null;

  // Test data
  const otherOrgId = 'org-456';

  // Fixture entity names for isolation tests
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

  // Set up the test environment once before all tests
  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;

    // Create service with real database
    service = new MultiTenantApiService<TestEntity>(
      setup.database,
      'testEntities',
      'testEntity',
      testModelSpec,
    );

    // Create organization service to get actual meta org
    organizationService = new OrganizationService(setup.database);

    // Get the actual meta org from the database
    actualMetaOrg = await organizationService.getMetaOrg(
      getTestMetaOrgUserContext(),
    );
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  // Set up before each test
  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    const systemUserContext = getSystemUserContext();

    // Recreate meta org after clearing collections (it gets deleted by clearCollections)
    await testUtils.createMetaOrg();

    // Get fresh meta org ID since it may have changed after clearCollections
    actualMetaOrg = await organizationService.getMetaOrg(EmptyUserContext);
    if (!actualMetaOrg) {
      throw new Error('Meta org not found after createMetaOrg');
    }
    // Update test objects with the actual meta org ID
    setTestMetaOrgId(actualMetaOrg._id);

    // Create a second organization for isolation tests
    const createdTestOrg = await organizationService.create(
      systemUserContext,
      getTestOrg(),
    );
    if (createdTestOrg) {
      actualTestOrg = createdTestOrg;
      setTestOrgId(createdTestOrg._id);
    }

    // Spy on TenantQueryDecorator methods to verify they're called
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQuery');
    vi.spyOn(TenantQueryDecorator.prototype, 'applyTenantToQueryOptions');
    vi.spyOn(TenantQueryDecorator.prototype, 'getOrgIdField');
  });

  // Helper to create an entity in the meta org
  async function createInMetaOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(getTestMetaOrgUserContext(), { name });
    if (!entity) throw new Error('Failed to create entity in meta org');
    return entity;
  }

  // Helper to create an entity in the test org
  async function createInTestOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(getTestOrgUserContext(), { name });
    if (!entity) throw new Error('Failed to create entity in test org');
    return entity;
  }

  // Helper to build a full TestEntity for update tests. The fullUpdateById method's signature
  // expects T, though system properties (_created, _createdBy, _orgId) are preserved from the
  // existing entity. This helper provides the required type fields for TypeScript compliance.
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

  // Test protected methods directly
  describe('prepareQuery', () => {
    it('should call TenantQueryDecorator.applyTenantToQuery with correct parameters', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const query = { name: 'Test' };

      // Get the protected method and bind it to the service instance
      const prepareQuery = (service as any).prepareQuery.bind(service);

      // Act
      prepareQuery(userContext, query);

      // Assert
      expect(
        TenantQueryDecorator.prototype.applyTenantToQuery,
      ).toHaveBeenCalledWith(userContext, query, 'testEntities');
    });

    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const query = { name: 'Test' };

      // Get the protected method and bind it to the service instance
      const prepareQuery = (service as any).prepareQuery.bind(service);

      // Act & Assert
      expect(() => prepareQuery(undefined, query)).toThrow(BadRequestError);
    });

    it('should override consumer-supplied _orgId with userContext _orgId', () => {
      // Arrange
      // Consumer is trying to supply their own _orgId (this should be ignored/overwritten)
      const query: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } },
      };

      // Act
      const result = service.prepareQuery(
        getTestMetaOrgUserContext(),
        query,
        [],
      );

      // Assert
      // The consumer-supplied _orgId should be completely overwritten by userContext.user._orgId
      expect(result.queryOptions.filters!['_orgId']).toEqual({
        eq: getTestMetaOrg()._id,
      });
      expect(result.queryOptions.filters!['_orgId']).not.toEqual({
        eq: otherOrgId,
      });
    });
  });

  describe('prepareQueryOptions', () => {
    it('should call TenantQueryDecorator.applyTenantToQueryOptions with the provided options', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } },
      };

      // Act
      const result = service.prepareQuery(userContext, queryOptions, []);

      // Assert
      expect(result.queryOptions.filters).toBeDefined();
      expect(result.queryOptions.filters!['name']).toEqual({ eq: 'Test' });
      expect(result.queryOptions.filters!['_orgId']).toEqual({
        eq: userContext.user ? userContext.user._orgId : undefined,
      });
    });

    it('should throw BadRequestError if userContext is undefined', () => {
      // Arrange
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
      };

      // Act & Assert
      expect(() =>
        service.prepareQuery(
          undefined as unknown as IUserContext,
          queryOptions,
          [],
        ),
      ).toThrow(BadRequestError);
    });

    it('should override consumer-supplied _orgId filter with userContext _orgId', () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        // Consumer is trying to supply their own _orgId (this should be ignored/overwritten)
        filters: { name: { eq: 'Test' }, _orgId: { eq: otherOrgId } },
      };

      // Act
      const result = service.prepareQuery(userContext, queryOptions, []);

      // Assert
      expect(result.queryOptions.filters).toBeDefined();
      expect(result.queryOptions.filters!['name']).toEqual({ eq: 'Test' });
      // The consumer-supplied _orgId should be completely overwritten by userContext.user._orgId
      expect(result.queryOptions.filters!['_orgId']).toEqual({
        eq: userContext.user ? userContext.user._orgId : undefined,
      });
      expect(result.queryOptions.filters!['_orgId']).not.toEqual({
        eq: otherOrgId,
      });
    });
  });

  describe('prepareEntity', () => {
    it('should add tenant ID to entity', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const entity: Partial<TestEntity> = {
        name: 'Test Entity',
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preProcessEntity.bind(service);

      // Act
      const result = await preparedEntity(userContext, entity, true);

      // Assert
      expect(result).toHaveProperty('_orgId', getTestMetaOrg()._id);
    });

    it('should throw BadRequestError if userContext is undefined', async () => {
      // Arrange
      const entity: Partial<TestEntity> = {
        name: 'Test Entity',
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preProcessEntity.bind(service);

      // Act & Assert
      await expect(
        preparedEntity(undefined as unknown as IUserContext, entity, true),
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if userContext has no _orgId', async () => {
      // Arrange
      const userContextWithoutOrg: IUserContext = {
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
      const entity: Partial<TestEntity> = {
        name: 'Test Entity',
      };

      // Get the protected method and bind it to the service instance
      const preparedEntity = service.preProcessEntity.bind(service);

      // Act & Assert
      await expect(
        preparedEntity(userContextWithoutOrg, entity, true),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // Test public methods
  describe('getAll', () => {
    it('should call prepareQuery and return entities', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const testEntity: TestEntity = {
        _id: testUtils.getRandomId(),
        name: 'Test Entity',
        _orgId: getTestMetaOrg()._id,
        _created: new Date(),
        _createdBy: 'system',
        _updated: new Date(),
        _updatedBy: 'system',
      };

      // Insert a test entity directly into the database
      await service.create(userContext, {
        _id: testEntity._id,
        name: testEntity.name,
        _orgId: testEntity._orgId,
      });

      // Spy on the protected method
      const spy = vi.spyOn(service as any, 'prepareQuery');

      // Act
      const result = await service.getAll(userContext);

      // Assert
      expect(spy).toHaveBeenCalledWith(userContext, {}, []);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return only entities in the caller\'s org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await service.getAll(getTestMetaOrgUserContext());
      const testOrgResults = await service.getAll(getTestOrgUserContext());

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._id).toBe(metaOrgEntity._id);
      expect(metaOrgResults[0].name).toBe(metaOrgEntityName);

      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._id).toBe(testOrgEntity._id);
      expect(testOrgResults[0].name).toBe(testOrgEntityName);
    });

    it('should return empty array when the caller\'s org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);

      const testOrgResults = await service.getAll(getTestOrgUserContext());

      expect(testOrgResults).toHaveLength(0);
    });

    it('should isolate interleaved concurrent reads across orgs', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaResults, testResults] = await Promise.all([
        service.getAll(getTestMetaOrgUserContext()),
        service.getAll(getTestOrgUserContext()),
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
      const prepareQueryCustom: PrepareQueryCustomFunction = (userContext, queryOptions, operations) => {
        prepareCalled = true;
        return { queryOptions, operations };
      };
      const postProcessEntityCustom: PostProcessEntityCustomFunction<TestEntity, TestEntityWithLabel> = (
        userContext,
        entity,
      ) => {
        return {
          ...entity,
          label: `labeled:${entity.name}`,
        };
      };

      const results = await service.getAll<TestEntityWithLabel>(
        getTestMetaOrgUserContext(),
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

      const userContextWithoutOrg: IUserContext = {
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

      await expect(service.getAll(userContextWithoutOrg)).rejects.toThrow(BadRequestError);
    });

    it('should return entities from all orgs for a system user', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await service.getAll(getSystemUserContext());

      expect(results).toHaveLength(2);
    });

    it('should return entities from all orgs for a meta org admin', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const results = await service.getAll(getTestMetaOrgAdminUserContext());

      expect(results).toHaveLength(2);
    });
  });

  describe('get', () => {
    it('should call prepareQueryOptions with the provided options', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      const queryOptions: IQueryOptions = {
        ...DefaultQueryOptions,
        filters: { name: { eq: 'Test' } },
      };

      // Act
      const result = await service.get(userContext, queryOptions);

      // Assert
      expect(result).toBeDefined();
      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });

    it('should return only paginated results from the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      const metaOrgResults = await service.get(getTestMetaOrgUserContext());
      const testOrgResults = await service.get(getTestOrgUserContext());

      expect(metaOrgResults.total).toBe(2);
      expect(metaOrgResults.entities).toHaveLength(2);

      expect(testOrgResults.total).toBe(1);
      expect(testOrgResults.entities).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('should not allow getting an entity from another org by ID', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        service.getById(getTestOrgUserContext(), metaOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should allow getting an entity from the same org by ID', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const result = await service.getById(getTestOrgUserContext(), testOrgEntity._id);

      expect(result).toBeDefined();
      expect(result._id).toBe(testOrgEntity._id);
      expect(result._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('getCount', () => {
    it('should only count entities in the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInMetaOrg(metaOrgEntityName + ' 2');
      await createInTestOrg(testOrgEntityName);

      const metaOrgCount = await service.getCount(getTestMetaOrgUserContext());
      const testOrgCount = await service.getCount(getTestOrgUserContext());

      expect(metaOrgCount).toBe(2);
      expect(testOrgCount).toBe(1);
    });

    it('should return zero when the caller\'s org has no entities', async () => {
      await createInMetaOrg(metaOrgEntityName);

      const testOrgCount = await service.getCount(getTestOrgUserContext());

      expect(testOrgCount).toBe(0);
    });

    it('should isolate counts during concurrent operations', async () => {
      await createInMetaOrg(concurrentMetaEntity1);
      await createInMetaOrg(concurrentMetaEntity2);
      await createInTestOrg(concurrentTestEntity1);
      await createInTestOrg(concurrentTestEntity2);
      await createInTestOrg(concurrentTestEntity3);

      const [metaCount, testCount, metaAll, testAll] = await Promise.all([
        service.getCount(getTestMetaOrgUserContext()),
        service.getCount(getTestOrgUserContext()),
        service.getAll(getTestMetaOrgUserContext()),
        service.getAll(getTestOrgUserContext()),
      ]);

      expect(metaCount).toBe(2);
      expect(testCount).toBe(3);
      expect(metaAll).toHaveLength(2);
      expect(testAll).toHaveLength(3);
    });
  });

  describe('create', () => {
    it('should create an entity with tenant ID', async () => {
      // Arrange
      if (!actualMetaOrg) {
        throw new Error('Meta org not found');
      }
      const userContext = getTestMetaOrgUserContext();
      // Use actual meta org ID from database
      const actualOrgId = actualMetaOrg._id;
      const entity: Partial<TestEntity> = {
        name: 'Test Entity',
      };

      // Act
      const created = await service.create(userContext, entity);

      // Assert
      expect(created).toBeDefined();
      expect(created?._id).toBeDefined();
      expect(created?.name).toBe('Test Entity');
      expect(created?._orgId).toBe(actualOrgId);

      // Verify it was actually inserted into the database
      const dbEntity = await service.getById(userContext, created!._id);
      expect(dbEntity).toBeDefined();
      expect(dbEntity?.name).toBe('Test Entity');
      expect(dbEntity?._orgId).toBe(actualOrgId);
    });
  });

  describe('partialUpdateById', () => {
    it('should update an entity by ID', async () => {
      // Arrange
      if (!actualMetaOrg) {
        throw new Error('Meta org not found');
      }
      const userContext = getTestMetaOrgUserContext();
      const actualOrgId = actualMetaOrg._id;

      // Create a test entity (let database auto-generate ID)
      const created = await service.create(userContext, { name: 'Original Name' });

      if (!created || !created._id) {
        throw new Error('Entity not created or missing ID');
      }

      const updateEntity: Partial<TestEntity> = {
        name: updatedMetaName,
      };

      // Act
      const updated = await service.partialUpdateById(
        userContext,
        created._id,
        updateEntity,
      );

      // Assert
      expect(updated).toBeDefined();
      expect(updated._id).toBe(created._id);
      expect(updated.name).toBe(updatedMetaName);
      expect(updated._orgId).toBe(actualOrgId);
    });

    it('should throw IdNotFoundError if entity not found', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      // Use an ID that doesn't exist (type depends on database)
      const isPostgres = process.env.TEST_DATABASE === 'postgres';
      const nonExistentId = isPostgres ? 999999 : '507f1f77bcf86cd799439011';
      const updateEntity: Partial<TestEntity> = {
        name: updatedMetaName,
      };

      // Act & Assert
      await expect(
        service.partialUpdateById(userContext, nonExistentId, updateEntity),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should not allow updating an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        service.partialUpdateById(getTestOrgUserContext(), metaOrgEntity._id, { name: attackName }),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(getTestMetaOrgUserContext(), metaOrgEntity._id);
      expect(unchanged.name).toBe(metaOrgEntityName);
    });

    it('should isolate interleaved concurrent mutations across orgs', async () => {
      const metaEntity = await createInMetaOrg(concurrentMetaOriginal);
      const testEntity = await createInTestOrg(concurrentTestOriginal);

      const [metaUpdated, testUpdated] = await Promise.all([
        service.partialUpdateById(getTestMetaOrgUserContext(), metaEntity._id, { name: concurrentMetaUpdated }),
        service.partialUpdateById(getTestOrgUserContext(), testEntity._id, { name: concurrentTestUpdated }),
      ]);

      expect(metaUpdated.name).toBe(concurrentMetaUpdated);
      expect(metaUpdated._orgId).toBe(actualMetaOrg!._id);

      expect(testUpdated.name).toBe(concurrentTestUpdated);
      expect(testUpdated._orgId).toBe(actualTestOrg!._id);

      const metaVerify = await service.getById(getTestMetaOrgUserContext(), metaEntity._id);
      const testVerify = await service.getById(getTestOrgUserContext(), testEntity._id);

      expect(metaVerify.name).toBe(concurrentMetaUpdated);
      expect(testVerify.name).toBe(concurrentTestUpdated);
    });

    it('should reject cross-org access during concurrent operations', async () => {
      const metaEntity = await createInMetaOrg(concurrentMetaProtected);
      const testEntity = await createInTestOrg(concurrentTestProtected);

      const results = await Promise.allSettled([
        service.getById(getTestOrgUserContext(), metaEntity._id),
        service.getById(getTestMetaOrgUserContext(), testEntity._id),
        service.partialUpdateById(getTestOrgUserContext(), metaEntity._id, { name: attackName }),
        service.partialUpdateById(getTestMetaOrgUserContext(), testEntity._id, { name: attackName }),
      ]);

      expect(results.every(r => r.status === 'rejected')).toBe(true);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(IdNotFoundError);
        }
      }

      const metaVerify = await service.getById(getTestMetaOrgUserContext(), metaEntity._id);
      const testVerify = await service.getById(getTestOrgUserContext(), testEntity._id);

      expect(metaVerify.name).toBe(concurrentMetaProtected);
      expect(testVerify.name).toBe(concurrentTestProtected);
    });
  });

  describe('fullUpdateById', () => {
    it('should not allow full update of an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const attackPayload = buildUpdateEntity(metaOrgEntity, { name: attackName });

      await expect(
        service.fullUpdateById(getTestOrgUserContext(), metaOrgEntity._id, attackPayload),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(getTestMetaOrgUserContext(), metaOrgEntity._id);
      expect(unchanged._orgId).toBe(actualMetaOrg!._id);
    });

    it('should allow full update of an entity in the same org', async () => {
      const testOrgEntity = await createInTestOrg(testOrgEntityName);
      const updatePayload = buildUpdateEntity(testOrgEntity, { name: updatedTestName });

      const updated = await service.fullUpdateById(
        getTestOrgUserContext(),
        testOrgEntity._id,
        updatePayload,
      );

      expect(updated.name).toBe(updatedTestName);
      expect(updated._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('partialUpdateByIdWithoutPreAndPostProcessing', () => {
    it('should not allow updating an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        service.partialUpdateByIdWithoutPreAndPostProcessing(
          getTestOrgUserContext(),
          metaOrgEntity._id,
          { name: attackName },
        ),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(getTestMetaOrgUserContext(), metaOrgEntity._id);
      expect(unchanged.name).toBe(metaOrgEntityName);
    });
  });

  describe('deleteById', () => {
    it('should delete an entity by ID', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();

      // Create a test entity (let database auto-generate ID)
      const created = await service.create(userContext, { name: 'Test Entity' });

      if (!created || !created._id) {
        throw new Error('Entity not created or missing ID');
      }

      // Verify it exists
      const beforeDelete = await service.getById(userContext, created._id);
      expect(beforeDelete).toBeDefined();

      // Act
      const deleteResult = await service.deleteById(userContext, created._id);

      // Assert
      expect(deleteResult).toBeDefined();
      expect(deleteResult.count).toBe(1);
      expect(deleteResult.success).toBe(true);

      // Verify it was actually deleted
      await expect(service.getById(userContext, created._id)).rejects.toThrow(
        IdNotFoundError,
      );
    });

    it('should throw IdNotFoundError if no entity found', async () => {
      // Arrange
      const userContext = getTestMetaOrgUserContext();
      // Use an ID that doesn't exist (type depends on database)
      const isPostgres = process.env.TEST_DATABASE === 'postgres';
      const nonExistentId = isPostgres ? 999999 : '507f1f77bcf86cd799439011';

      // Act & Assert
      await expect(
        service.deleteById(userContext, nonExistentId),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should not allow deleting an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);

      await expect(
        service.deleteById(getTestOrgUserContext(), metaOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);

      const stillExists = await service.getById(getTestMetaOrgUserContext(), metaOrgEntity._id);
      expect(stillExists).toBeDefined();
      expect(stillExists._id).toBe(metaOrgEntity._id);
    });

    it('should isolate deletes during concurrent operations', async () => {
      const metaToDelete = await createInMetaOrg(concurrentMetaToDelete);
      const testToDelete = await createInTestOrg(concurrentTestToDelete);
      const metaToKeep = await createInMetaOrg(concurrentMetaToKeep);
      const testToKeep = await createInTestOrg(concurrentTestToKeep);

      const [metaDelete, testDelete] = await Promise.all([
        service.deleteById(getTestMetaOrgUserContext(), metaToDelete._id),
        service.deleteById(getTestOrgUserContext(), testToDelete._id),
      ]);

      expect(metaDelete.count).toBe(1);
      expect(testDelete.count).toBe(1);

      const metaRemaining = await service.getAll(getTestMetaOrgUserContext());
      const testRemaining = await service.getAll(getTestOrgUserContext());

      expect(metaRemaining).toHaveLength(1);
      expect(metaRemaining[0]._id).toBe(metaToKeep._id);

      expect(testRemaining).toHaveLength(1);
      expect(testRemaining[0]._id).toBe(testToKeep._id);
    });
  });

  describe('find', () => {
    it('should only find entities in the caller\'s org', async () => {
      await createInMetaOrg(sharedEntityName);
      await createInTestOrg(sharedEntityName);

      const metaOrgResults = await service.find(getTestMetaOrgUserContext(), { filters: { name: { eq: sharedEntityName } } });
      const testOrgResults = await service.find(getTestOrgUserContext(), { filters: { name: { eq: sharedEntityName } } });

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

      const metaOrgResult = await service.findOne(getTestMetaOrgUserContext(), { filters: { name: { eq: sharedEntityName } } });
      const testOrgResult = await service.findOne(getTestOrgUserContext(), { filters: { name: { eq: sharedEntityName } } });

      expect(metaOrgResult).toBeDefined();
      expect(metaOrgResult?._id).toBe(metaOrgEntity._id);
      expect(metaOrgResult?._orgId).toBe(actualMetaOrg!._id);

      expect(testOrgResult).toBeDefined();
      expect(testOrgResult?._id).toBe(testOrgEntity._id);
      expect(testOrgResult?._orgId).toBe(actualTestOrg!._id);
    });
  });

  describe('deleteMany', () => {
    it('should only delete entities in the caller\'s org', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await createInTestOrg(testOrgEntityName);

      const deleteResult = await service.deleteMany(getTestMetaOrgUserContext(), {});

      expect(deleteResult.count).toBe(1);

      const testOrgResults = await service.getAll(getTestOrgUserContext());
      expect(testOrgResults).toHaveLength(1);
    });
  });

  describe('batchUpdate', () => {
    it('should only update entities in the caller\'s org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      const testOrgEntity = await createInTestOrg(testOrgEntityName);

      const batchUpdates: Partial<TestEntity>[] = [
        { _id: metaOrgEntity._id, name: updatedMetaName },
        { _id: testOrgEntity._id, name: updatedTestName },
      ];

      const updatedEntities = await service.batchUpdate(getTestMetaOrgUserContext(), batchUpdates);

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBe(metaOrgEntity._id);
      expect(updatedEntities[0].name).toBe(updatedMetaName);

      const unchangedTestEntity = await service.getById(getTestOrgUserContext(), testOrgEntity._id);
      expect(unchangedTestEntity.name).toBe(testOrgEntityName);
    });
  });

  describe('update', () => {
    it('should only update entities in the caller\'s org based on query', async () => {
      await createInMetaOrg(sharedEntityName);
      await createInTestOrg(sharedEntityName);

      const queryOptions: IQueryOptions = { filters: { name: { eq: sharedEntityName } } };
      const updatedEntities = await service.update(getTestMetaOrgUserContext(), queryOptions, { description: 'Updated description' });

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._orgId).toBe(actualMetaOrg!._id);

      const testOrgEntity = await service.findOne(getTestOrgUserContext(), { filters: { name: { eq: sharedEntityName } } });
      expect(testOrgEntity?.description).toBeUndefined();
    });
  });

  describe('getModelSpecForPreProcessing', () => {
    const baseItemSpec = entityUtils.getModelSpec(
      Type.Object({
        name: Type.String(),
        value: Type.Optional(Type.Number()),
        notes: Type.Optional(Type.String()),
      }),
      { isAuditable: true },
    );

    class OverrideModelSpecMultiTenantService extends MultiTenantApiService<ITestItem> {
      constructor(db: IDatabase) {
        super(db, 'testItems', 'testItem', baseItemSpec);
      }

      protected override async getModelSpecForPreProcessing(
        _userContext: IUserContext,
        _entity: Partial<ITestItem>,
      ): Promise<IModelSpec> {
        return TestItemSpec;
      }
    }

    it('should decode with a subclass override spec and stamp _orgId', async () => {
      const overrideService = new OverrideModelSpecMultiTenantService(database);
      const isoDateString = new Date().toISOString();

      const createdEntity = await overrideService.create(getTestMetaOrgUserContext(), {
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

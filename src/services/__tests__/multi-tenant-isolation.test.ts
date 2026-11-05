import {
  EmptyUserContext,
  IEntity,
  IOrganization,
  IQueryOptions,
  IUserContext,
  getSystemUserContext,
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
  getTestMetaOrg,
  getTestMetaOrgUserContext,
  getTestOrg,
  getTestOrgUserContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import { IdNotFoundError } from '../../errors/index.js';
import type { IDatabase } from '../../databases/models/index.js';
import { MultiTenantApiService } from '../multi-tenant-api.service.js';
import { OrganizationService } from '../organization.service.js';
import { OrganizationDomainService } from '../organization-domain.service.js';

beforeAll(() => {
  initializeTypeBox();
});

/**
 * Tests for multi-tenant data isolation.
 * 
 * These tests verify that in multi-tenant mode, one organization cannot:
 * - See another organization's data (getAll, get, getById, find, findOne)
 * - Count another organization's data (getCount)
 * - Update another organization's data (partialUpdateById, fullUpdateById, batchUpdate, update)
 * - Delete another organization's data (deleteById, deleteMany)
 * 
 * Each test creates data in both organizations and verifies that operations
 * from one organization cannot access or modify the other organization's data.
 */
describe('MultiTenantApiService - Cross-Organization Isolation', () => {
  let service: MultiTenantApiService<TestEntity>;
  let database: IDatabase;
  let organizationService: OrganizationService;
  let organizationDomainService: OrganizationDomainService;
  let metaOrg: IOrganization;
  let testOrg: IOrganization;
  let metaOrgUserContext: IUserContext;
  let testOrgUserContext: IUserContext;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;

    service = new MultiTenantApiService<TestEntity>(
      database,
      'testEntities',
      'testEntity',
      testModelSpec,
    );

    organizationService = new OrganizationService(database);
    organizationDomainService = new OrganizationDomainService(database);
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();

    const systemUserContext = getSystemUserContext();

    const createdMetaOrg = await organizationService.create(
      systemUserContext,
      getTestMetaOrg(),
    );
    if (!createdMetaOrg) {
      throw new Error('Failed to create meta org');
    }
    metaOrg = createdMetaOrg;
    setTestMetaOrgId(metaOrg._id);

    const createdTestOrg = await organizationService.create(
      systemUserContext,
      getTestOrg(),
    );
    if (!createdTestOrg) {
      throw new Error('Failed to create test org');
    }
    testOrg = createdTestOrg;
    setTestOrgId(testOrg._id);

    metaOrgUserContext = getTestMetaOrgUserContext();
    testOrgUserContext = getTestOrgUserContext();
  });

  async function createEntityInMetaOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(metaOrgUserContext, { name } as Partial<TestEntity>);
    if (!entity) {
      throw new Error('Failed to create entity in meta org');
    }
    return entity;
  }

  async function createEntityInTestOrg(name: string): Promise<TestEntity> {
    const entity = await service.create(testOrgUserContext, { name } as Partial<TestEntity>);
    if (!entity) {
      throw new Error('Failed to create entity in test org');
    }
    return entity;
  }

  describe('getAll - tenant isolation', () => {
    it('should only return entities from the callers organization', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');
      const testOrgEntity = await createEntityInTestOrg('Test Org Entity');

      const metaOrgResults = await service.getAll(metaOrgUserContext);
      const testOrgResults = await service.getAll(testOrgUserContext);

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._id).toBe(metaOrgEntity._id);
      expect(metaOrgResults[0].name).toBe('Meta Org Entity');

      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._id).toBe(testOrgEntity._id);
      expect(testOrgResults[0].name).toBe('Test Org Entity');
    });

    it('should return empty array when organization has no entities', async () => {
      await createEntityInMetaOrg('Meta Org Entity');

      const testOrgResults = await service.getAll(testOrgUserContext);

      expect(testOrgResults).toHaveLength(0);
    });
  });

  describe('getCount - tenant isolation', () => {
    it('should only count entities from the callers organization', async () => {
      await createEntityInMetaOrg('Meta Org Entity 1');
      await createEntityInMetaOrg('Meta Org Entity 2');
      await createEntityInTestOrg('Test Org Entity 1');

      const metaOrgCount = await service.getCount(metaOrgUserContext);
      const testOrgCount = await service.getCount(testOrgUserContext);

      expect(metaOrgCount).toBe(2);
      expect(testOrgCount).toBe(1);
    });

    it('should return zero when organization has no entities', async () => {
      await createEntityInMetaOrg('Meta Org Entity');

      const testOrgCount = await service.getCount(testOrgUserContext);

      expect(testOrgCount).toBe(0);
    });
  });

  describe('partialUpdateById - tenant isolation', () => {
    it('should not allow updating an entity from another organization', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');

      await expect(
        service.partialUpdateById(testOrgUserContext, metaOrgEntity._id, { name: 'Hacked Name' }),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(metaOrgUserContext, metaOrgEntity._id);
      expect(unchanged.name).toBe('Meta Org Entity');
    });

    it('should allow updating an entity from the same organization', async () => {
      const testOrgEntity = await createEntityInTestOrg('Original Name');

      const updated = await service.partialUpdateById(testOrgUserContext, testOrgEntity._id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated._orgId).toBe(testOrg._id);
    });
  });

  describe('fullUpdateById - tenant isolation', () => {
    it('should not allow full update of an entity from another organization', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');

      await expect(
        service.fullUpdateById(metaOrgUserContext, metaOrgEntity._id, { name: 'Hacked Name' } as TestEntity),
      ).resolves.toBeDefined();

      await expect(
        service.fullUpdateById(testOrgUserContext, metaOrgEntity._id, { name: 'Hacked Name' } as TestEntity),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(metaOrgUserContext, metaOrgEntity._id);
      expect(unchanged._orgId).toBe(metaOrg._id);
    });

    it('should allow full update of an entity from the same organization', async () => {
      const testOrgEntity = await createEntityInTestOrg('Original Name');

      const updated = await service.fullUpdateById(testOrgUserContext, testOrgEntity._id, { name: 'Updated Name' } as TestEntity);

      expect(updated.name).toBe('Updated Name');
      expect(updated._orgId).toBe(testOrg._id);
    });
  });

  describe('deleteById - tenant isolation', () => {
    it('should not allow deleting an entity from another organization', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');

      await expect(
        service.deleteById(testOrgUserContext, metaOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);

      const stillExists = await service.getById(metaOrgUserContext, metaOrgEntity._id);
      expect(stillExists).toBeDefined();
      expect(stillExists._id).toBe(metaOrgEntity._id);
    });

    it('should allow deleting an entity from the same organization', async () => {
      const testOrgEntity = await createEntityInTestOrg('Test Org Entity');

      const deleteResult = await service.deleteById(testOrgUserContext, testOrgEntity._id);

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.count).toBe(1);

      await expect(
        service.getById(testOrgUserContext, testOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);
    });
  });

  describe('get (paginated) - tenant isolation', () => {
    it('should only return paginated results from the callers organization', async () => {
      await createEntityInMetaOrg('Meta Org Entity 1');
      await createEntityInMetaOrg('Meta Org Entity 2');
      await createEntityInTestOrg('Test Org Entity');

      const metaOrgResults = await service.get(metaOrgUserContext);
      const testOrgResults = await service.get(testOrgUserContext);

      expect(metaOrgResults.total).toBe(2);
      expect(metaOrgResults.entities).toHaveLength(2);

      expect(testOrgResults.total).toBe(1);
      expect(testOrgResults.entities).toHaveLength(1);
    });
  });

  describe('getById - tenant isolation', () => {
    it('should not allow getting an entity from another organization by ID', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');

      await expect(
        service.getById(testOrgUserContext, metaOrgEntity._id),
      ).rejects.toThrow(IdNotFoundError);
    });

    it('should allow getting an entity from the same organization by ID', async () => {
      const testOrgEntity = await createEntityInTestOrg('Test Org Entity');

      const result = await service.getById(testOrgUserContext, testOrgEntity._id);

      expect(result).toBeDefined();
      expect(result._id).toBe(testOrgEntity._id);
      expect(result._orgId).toBe(testOrg._id);
    });
  });

  describe('find - tenant isolation', () => {
    it('should only find entities from the callers organization', async () => {
      await createEntityInMetaOrg('Shared Name');
      await createEntityInTestOrg('Shared Name');

      const metaOrgResults = await service.find(metaOrgUserContext, { filters: { name: { eq: 'Shared Name' } } });
      const testOrgResults = await service.find(testOrgUserContext, { filters: { name: { eq: 'Shared Name' } } });

      expect(metaOrgResults).toHaveLength(1);
      expect(metaOrgResults[0]._orgId).toBe(metaOrg._id);

      expect(testOrgResults).toHaveLength(1);
      expect(testOrgResults[0]._orgId).toBe(testOrg._id);
    });
  });

  describe('findOne - tenant isolation', () => {
    it('should only find one entity from the callers organization', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Shared Name');
      const testOrgEntity = await createEntityInTestOrg('Shared Name');

      const metaOrgResult = await service.findOne(metaOrgUserContext, { filters: { name: { eq: 'Shared Name' } } });
      const testOrgResult = await service.findOne(testOrgUserContext, { filters: { name: { eq: 'Shared Name' } } });

      expect(metaOrgResult).toBeDefined();
      expect(metaOrgResult?._id).toBe(metaOrgEntity._id);
      expect(metaOrgResult?._orgId).toBe(metaOrg._id);

      expect(testOrgResult).toBeDefined();
      expect(testOrgResult?._id).toBe(testOrgEntity._id);
      expect(testOrgResult?._orgId).toBe(testOrg._id);
    });
  });

  describe('deleteMany - tenant isolation', () => {
    it('should only delete entities from the callers organization', async () => {
      await createEntityInMetaOrg('Meta Org Entity');
      await createEntityInTestOrg('Test Org Entity');

      const deleteResult = await service.deleteMany(metaOrgUserContext, {});

      expect(deleteResult.count).toBe(1);

      const testOrgResults = await service.getAll(testOrgUserContext);
      expect(testOrgResults).toHaveLength(1);
    });
  });

  describe('batchUpdate - tenant isolation', () => {
    it('should only update entities from the callers organization in batch', async () => {
      const metaOrgEntity = await createEntityInMetaOrg('Meta Org Entity');
      const testOrgEntity = await createEntityInTestOrg('Test Org Entity');

      const batchUpdates: Partial<TestEntity>[] = [
        { _id: metaOrgEntity._id, name: 'Updated Meta' },
        { _id: testOrgEntity._id, name: 'Updated Test' },
      ];

      const updatedEntities = await service.batchUpdate(metaOrgUserContext, batchUpdates);

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._id).toBe(metaOrgEntity._id);
      expect(updatedEntities[0].name).toBe('Updated Meta');

      const unchangedTestEntity = await service.getById(testOrgUserContext, testOrgEntity._id);
      expect(unchangedTestEntity.name).toBe('Test Org Entity');
    });
  });

  describe('update (query-based) - tenant isolation', () => {
    it('should only update entities from the callers organization based on query', async () => {
      await createEntityInMetaOrg('Shared Name');
      await createEntityInTestOrg('Shared Name');

      const queryOptions: IQueryOptions = { filters: { name: { eq: 'Shared Name' } } };
      const updatedEntities = await service.update(metaOrgUserContext, queryOptions, { description: 'Updated Description' });

      expect(updatedEntities).toHaveLength(1);
      expect(updatedEntities[0]._orgId).toBe(metaOrg._id);

      const testOrgEntity = await service.findOne(testOrgUserContext, { filters: { name: { eq: 'Shared Name' } } });
      expect(testOrgEntity?.description).toBeUndefined();
    });
  });
});

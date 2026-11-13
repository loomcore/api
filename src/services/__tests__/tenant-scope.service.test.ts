import {
  EmptyUserContext,
  getSystemUserContext,
  type IOrganization,
  type IUserContext,
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
  getSystemContext,
  getTestMetaOrgAdminContext,
  getTestMetaOrgContext,
  getTestMetaOrgUser,
  getTestOrg,
  getTestOrgContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import type { IDatabase } from '../../databases/models/index.js';
import { BadRequestError, IdNotFoundError } from '../../errors/index.js';
import { GenericApiService } from '../generic-api-service/generic-api.service.js';
import { OrganizationService } from '../organization.service.js';
import { TenantScope } from '../tenant-scope.js';
import type { IRequestContext } from '../request-context.interface.js';

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
  const attackName = 'Attempted Cross-Org Update';
  const updatedMetaName = 'Updated Meta Entity';
  const updatedTestName = 'Updated Test Entity';

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

  describe('getAll', () => {
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

    it('should reject getAll when userContext has no _orgId', async () => {
      await createInMetaOrg(metaOrgEntityName);
      await expect(service.getAll(contextWithoutOrg())).rejects.toThrow(BadRequestError);
    });
  });

  describe('get', () => {
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

    it('should not allow updating an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await expect(
        service.partialUpdateById(getTestOrgContext(), metaOrgEntity._id, { name: attackName }),
      ).rejects.toThrow(IdNotFoundError);

      const unchanged = await service.getById(getTestMetaOrgContext(), metaOrgEntity._id);
      expect(unchanged.name).toBe(metaOrgEntityName);
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
  });

  describe('deleteById', () => {
    it('should delete an entity by ID in the same org', async () => {
      const created = await service.create(getTestMetaOrgContext(), { name: 'Test Entity' });
      const deleteResult = await service.deleteById(getTestMetaOrgContext(), created!._id);
      expect(deleteResult.count).toBe(1);
      await expect(service.getById(getTestMetaOrgContext(), created!._id)).rejects.toThrow(IdNotFoundError);
    });

    it('should not allow deleting an entity from another org', async () => {
      const metaOrgEntity = await createInMetaOrg(metaOrgEntityName);
      await expect(service.deleteById(getTestOrgContext(), metaOrgEntity._id)).rejects.toThrow(IdNotFoundError);
      const stillThere = await service.getById(getTestMetaOrgContext(), metaOrgEntity._id);
      expect(stillThere.name).toBe(metaOrgEntityName);
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
  });
});

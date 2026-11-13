import type { IEntity, IModelSpec, IUserContext } from '@loomcore/common/models';
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
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getSystemContext,
  getTestMetaOrgAdminContext,
  getTestMetaOrgContext,
  getTestOrg,
  getTestOrgContext,
  setTestMetaOrgId,
  setTestOrgId,
} from '../../__tests__/test-objects.js';
import { CrossTenant } from '../../decorators/cross-tenant.decorator.js';
import type { IDatabase } from '../../databases/models/index.js';
import { IdNotFoundError, ServerError } from '../../errors/index.js';
import { GenericApiService } from '../generic-api-service/generic-api.service.js';
import type { IModelSpecResolver } from '../model-spec-resolver.interface.js';
import { OrganizationService } from '../organization.service.js';
import type { Filters } from '../filters.type.js';
import type { IQueryScope } from '../query-scope.interface.js';
import type { IRequestContext } from '../request-context.interface.js';
import { EmptyUserContext } from '@loomcore/common/models';

beforeAll(() => {
  initializeTypeBox();
});

/** Custom scope that restricts reads/writes to isActive === true (uses existing test_entities table). */
class IsActiveScope implements IQueryScope<IRequestContext> {
  getFilters(_context: IRequestContext): Filters {
    return { isActive: { eq: true } };
  }

  applyToEntity(_context: IRequestContext, entity: Partial<IEntity>, _isCreate: boolean): void {
    (entity as Partial<TestEntity>).isActive = true;
  }
}

class ActiveScopedService extends GenericApiService<TestEntity> {
  constructor(database: IDatabase) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
    this.scopes = [new IsActiveScope()];
  }
}

class StrippedFieldsService extends GenericApiService<TestEntity> {
  public strippedCalls: Array<{ original: unknown; cleaned: unknown }> = [];

  constructor(database: IDatabase) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
  }

  protected override onFieldsStripped(
    _context: IRequestContext,
    original: unknown,
    cleaned: unknown,
  ): void {
    this.strippedCalls.push({ original, cleaned });
  }
}

class CountingResolver implements IModelSpecResolver<IRequestContext> {
  public resolveCount = 0;

  constructor(private readonly spec: IModelSpec) {}

  async resolve(_context: IRequestContext): Promise<IModelSpec> {
    this.resolveCount += 1;
    return this.spec;
  }
}

class ResolverService extends GenericApiService<TestEntity> {
  public resolver: CountingResolver;

  constructor(database: IDatabase, resolver: CountingResolver) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
    this.resolver = resolver;
    this.modelSpecResolver = resolver;
  }
}

@CrossTenant('Cross-tenant fixture service for query-scope tests')
class CrossTenantService extends GenericApiService<TestEntity> {
  constructor(database: IDatabase) {
    super(database, 'testEntity', 'testEntities', testModelSpec);
  }
}

describe('IQueryScope custom filters', () => {
  let database: IDatabase;
  let service: ActiveScopedService;
  let organizationService: OrganizationService;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
    service = new ActiveScopedService(database);
    organizationService = new OrganizationService(database);
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.createMetaOrg();
    const metaOrg = await organizationService.getMetaOrg({ userContext: EmptyUserContext });
    if (!metaOrg) throw new Error('Meta org missing');
    setTestMetaOrgId(metaOrg._id);
    const testOrg = await organizationService.create(getSystemContext(), getTestOrg());
    if (testOrg) setTestOrgId(testOrg._id);
  });

  describe('getAll', () => {
    it('should apply custom scope filters to getAll', async () => {
      const unrestricted = new GenericApiService<TestEntity>(database, 'testEntity', 'testEntities', testModelSpec);
      await service.create(getTestMetaOrgContext(), { name: 'Active One', isActive: true });
      // Seed inactive via unrestricted service (no IsActiveScope) so both DBs get proper preprocessing
      await unrestricted.create(getTestMetaOrgContext(), { name: 'Inactive One', isActive: false });

      const results = await service.getAll(getTestMetaOrgContext());
      expect(results.every((e) => e.isActive === true)).toBe(true);
      expect(results.some((e) => e.name === 'Active One')).toBe(true);
      expect(results.some((e) => e.name === 'Inactive One')).toBe(false);
    });
  });

  describe('getById', () => {
    it('should return IdNotFoundError when by-id is filtered out by scope with no extra read', async () => {
      const unrestricted = new GenericApiService<TestEntity>(database, 'testEntity', 'testEntities', testModelSpec);
      const created = await unrestricted.create(getTestMetaOrgContext(), {
        name: 'Inactive By Id',
        isActive: false,
      });

      const findOneSpy = vi.spyOn(database, 'findOne');
      await expect(service.getById(getTestMetaOrgContext(), created!._id)).rejects.toThrow(
        IdNotFoundError,
      );
      // Single scoped findOne — no follow-up unscoped read
      expect(findOneSpy).toHaveBeenCalledTimes(1);
      findOneSpy.mockRestore();
    });
  });

  describe('create', () => {
    it('should apply custom scope applyToEntity on every write', async () => {
      const created = await service.create(getTestMetaOrgContext(), {
        name: 'Should Be Active',
        isActive: false,
      });
      expect(created?.isActive).toBe(true);
    });
  });
});

describe('IModelSpecResolver', () => {
  let database: IDatabase;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.createMetaOrg();
  });

  describe('resolveModelSpec', () => {
    it('should call custom IModelSpecResolver once per write', async () => {
      const resolver = new CountingResolver(testModelSpec);
      const service = new ResolverService(database, resolver);

      await service.create(getTestMetaOrgContext(), { name: 'Resolver create' });
      expect(resolver.resolveCount).toBe(1);

      const created = await service.create(getTestMetaOrgContext(), { name: 'Another' });
      await service.partialUpdateById(getTestMetaOrgContext(), created!._id, { name: 'Updated' });
      // create + create + partialUpdate = 3 writes, each resolves once (memoized per context object)
      expect(resolver.resolveCount).toBe(3);
    });

    it('should use the resolved spec for validate/decode/encode on write', async () => {
      // Spec requires name minLength 5 — stricter than the default TestEntity schema
      const strictSpec = entityUtils.getModelSpec(
        Type.Object({
          name: Type.String({ minLength: 5 }),
          isActive: Type.Optional(Type.Boolean()),
        }),
        { isAuditable: true },
      );
      const resolver = new CountingResolver(strictSpec);
      const service = new ResolverService(database, resolver);

      await expect(
        service.create(getTestMetaOrgContext(), { name: 'ab' }),
      ).rejects.toThrow();
      expect(resolver.resolveCount).toBe(1);

      const created = await service.create(getTestMetaOrgContext(), { name: 'Valid' });
      expect(created).toBeDefined();
      expect(created!.name).toBe('Valid');
      expect(resolver.resolveCount).toBe(2);
    });
  });
});

describe('onFieldsStripped', () => {
  let database: IDatabase;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.createMetaOrg();
  });

  describe('create', () => {
    it('should fire onFieldsStripped when unknown fields are present', async () => {
      const service = new StrippedFieldsService(database);
      await service.create(getTestMetaOrgContext(), {
        name: 'Strip me',
        extraProperty: 'gone',
      } as any);

      expect(service.strippedCalls.length).toBeGreaterThanOrEqual(1);
      expect((service.strippedCalls[0].original as any).extraProperty).toBe('gone');
      expect((service.strippedCalls[0].cleaned as any).extraProperty).toBeUndefined();
    });
  });
});

describe('@CrossTenant', () => {
  let database: IDatabase;
  let organizationService: OrganizationService;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    database = setup.database;
    organizationService = new OrganizationService(database);
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.createMetaOrg();
    const metaOrg = await organizationService.getMetaOrg({ userContext: EmptyUserContext });
    if (!metaOrg) throw new Error('Meta org missing');
    setTestMetaOrgId(metaOrg._id);
    const testOrg = await organizationService.create(getSystemContext(), getTestOrg());
    if (testOrg) setTestOrgId(testOrg._id);
  });

  describe('getAll', () => {
    it('should see entities across tenants when decorated with @CrossTenant', async () => {
      const isolated = new GenericApiService<TestEntity>(
        database,
        'testEntity',
        'testEntities',
        testModelSpec,
      );
      const cross = new CrossTenantService(database);

      await isolated.create(getTestMetaOrgContext(), { name: 'Meta Entity' });
      await isolated.create(getTestOrgContext(), { name: 'Org Entity' });

      const crossResults = await cross.getAll(getTestOrgContext());
      expect(crossResults.length).toBeGreaterThanOrEqual(2);
      expect(crossResults.some((e) => e.name === 'Meta Entity')).toBe(true);
      expect(crossResults.some((e) => e.name === 'Org Entity')).toBe(true);
    });
  });

  describe('decorator', () => {
    it('should fail when @CrossTenant reason is empty', () => {
      expect(() => {
        @CrossTenant('')
        class BadCrossTenantService extends GenericApiService<TestEntity> {}
        return BadCrossTenantService;
      }).toThrow(ServerError);
    });
  });
});

describe('GenericApiService constructor', () => {
  it('should accept singular then plural resource names', async () => {
    const setup = await TestExpressApp.init();
    const service = new GenericApiService<TestEntity>(
      setup.database,
      'testEntity',
      'testEntities',
      testModelSpec,
    );
    expect((service as any).singularResourceName).toBe('testEntity');
    expect((service as any).pluralResourceName).toBe('testEntities');
    await TestExpressApp.cleanup();
  });
});

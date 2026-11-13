/**
 * GenericQueryService - A service for handling complex data fetching with joins
 *
 * This service is designed for complex queries that require joins to build full responses.
 * Unlike GenericApiService which handles CRUD operations, this service focuses on read operations
 * with complex joins.
 *
 * @example
 * ```typescript
 * // Create join operations for client-report
 * const joinPerson = new LeftJoin('persons', 'person_id', '_id', 'person');
 * const joinEmailAddresses = new LeftJoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
 *
 * // Create the service with default operations
 * const clientReportService = new GenericQueryService<IClientReportsModel>(
 *   database,
 *   'client',
 *   'clients',
 *   clientReportsModelSpec,
 *   [joinPerson, joinEmailAddresses]  // default operations
 * );
 *
 * // Use the service
 * const result = await clientReportService.getById(context, clientId);
 * // Result will have person and email_addresses populated
 * ```
 */
import type { IEntity, IQueryOptions, IPagedResult, IModelSpec } from '@loomcore/common/models';
import { DefaultQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { config } from '../../config/base-api-config.js';
import { IGenericQueryService } from './generic-query-service.interface.js';
import { Operation } from '../../databases/operations/operation.js';
import { IdNotFoundError } from '../../errors/index.js';
import { IDatabase } from '../../databases/models/index.js';
import { hasCrossTenant } from '../../decorators/cross-tenant.decorator.js';
import type { Filters } from '../filters.type.js';
import type { IQueryScope } from '../query-scope.interface.js';
import type { IRequestContext } from '../request-context.interface.js';
import type { TenancyMode } from '../tenancy-mode.type.js';
import { tenantScope } from '../tenant-scope.js';
import { IModelSpecResolver, StaticModelSpecResolver } from '../model-spec-resolver.interface.js';
import { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../types.js';

export class GenericQueryService<T extends IEntity, TContext extends IRequestContext = IRequestContext>
  implements IGenericQueryService<T, TContext>
{
  protected database: IDatabase;
  protected singularResourceName: string;
  protected pluralResourceName: string;
  protected modelSpec: IModelSpec;
  protected defaultOperations: Operation[] = [];
  /** Feature scopes declared by derived services. Never list TenantScope here. */
  protected scopes: IQueryScope<TContext>[] = [];
  /** 'isolated' unless the class is decorated with @CrossTenant. */
  protected readonly tenancy: TenancyMode;
  protected modelSpecResolver: IModelSpecResolver<TContext>;
  private readonly resolvedSpecs = new WeakMap<TContext, Promise<IModelSpec>>();

  /**
   * @constructs GenericQueryService<T> where T extends IEntity
   * @param database The database instance
   * @param singularResourceName The singular resource name (e.g. 'client')
   * @param pluralResourceName The plural resource name (e.g. 'clients')
   * @param modelSpec The model spec for the result type
   * @param defaultOperations Optional default operations (joins) to apply to all queries
   */
  constructor(
    database: IDatabase,
    singularResourceName: string,
    pluralResourceName: string,
    modelSpec: IModelSpec,
    defaultOperations: Operation[] = [],
  ) {
    this.database = database;
    this.singularResourceName = singularResourceName;
    this.pluralResourceName = pluralResourceName;
    this.modelSpec = modelSpec;
    this.defaultOperations = defaultOperations;
    this.tenancy = hasCrossTenant(this.constructor) ? 'crossTenant' : 'isolated';
    this.modelSpecResolver = new StaticModelSpecResolver(this.modelSpec);
  }

  /** Resolves once per request: memoized on the context object for the request's lifetime only. */
  async resolveModelSpec(context: TContext): Promise<IModelSpec> {
    let spec = this.resolvedSpecs.get(context);
    if (!spec) {
      spec = this.modelSpecResolver.resolve(context);
      this.resolvedSpecs.set(context, spec);
    }
    return spec;
  }

  protected getEffectiveScopes(): IQueryScope<TContext>[] {
    const tenantScopes =
      config.app.isMultiTenant && this.tenancy === 'isolated'
        ? [tenantScope as IQueryScope<TContext>]
        : [];
    return [...tenantScopes, ...this.scopes];
  }

  protected getScopeFilters(context: TContext): Filters {
    return this.getEffectiveScopes().reduce<Filters>(
      (filters, scope) => ({ ...filters, ...scope.getFilters(context) }),
      {},
    );
  }

  /**
   * Shapes the query via prepareQuery, then merges scope filters last so a prepareQuery
   * override cannot drop or widen them. A caller-supplied filter on a scoped field is overwritten.
   */
  protected buildQuery(
    context: TContext,
    queryOptions: IQueryOptions,
    operations: Operation[] = [],
  ): { queryOptions: IQueryOptions; operations: Operation[] } {
    const prepared = this.prepareQuery(context, queryOptions, operations);
    return {
      operations: prepared.operations,
      queryOptions: {
        ...prepared.queryOptions,
        filters: { ...prepared.queryOptions.filters, ...this.getScopeFilters(context) },
      },
    };
  }

  protected applyScopesToEntity(context: TContext, entity: Partial<T>, isCreate: boolean): void {
    for (const scope of this.getEffectiveScopes()) {
      scope.applyToEntity(context, entity, isCreate);
    }
  }

  async getAll(context: TContext): Promise<T[]>;

  async getAll<TCustom extends IEntity>(
    context: TContext,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<TCustom[]>;

  async getAll<Y extends IEntity = T>(
    context: TContext,
    prepareQueryCustom?: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y, TContext>,
  ): Promise<Y[]> {
    let operations: Operation[] = [];
    let queryOptions: IQueryOptions = {};
    if (prepareQueryCustom) {
      ({ operations, queryOptions } = prepareQueryCustom(context, {}, []));
    }
    ({ operations, queryOptions } = this.buildQuery(context, queryOptions, operations));

    const spec = await this.resolveModelSpec(context);
    const entities = await this.database.getAll<T>(
      this.pluralResourceName,
      queryOptions.filters || {},
      operations,
    );

    return entities.map((entity) => {
      const dbProcessed = this.postProcessEntity(context, spec, entity);
      if (postProcessEntityCustom) {
        return postProcessEntityCustom(context, dbProcessed);
      }
      return dbProcessed as unknown as Y;
    });
  }

  async get(context: TContext, queryOptions?: IQueryOptions): Promise<IPagedResult<T>>;

  async get<TCustom extends IEntity>(
    context: TContext,
    queryOptions: IQueryOptions,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<IPagedResult<TCustom>>;

  async get<Y extends IEntity = T>(
    context: TContext,
    queryOptions: IQueryOptions = { ...DefaultQueryOptions },
    prepareQueryCustom?: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y, TContext>,
  ): Promise<IPagedResult<Y>> {
    let operations: Operation[] = [];
    if (prepareQueryCustom) {
      ({ queryOptions, operations } = prepareQueryCustom(context, queryOptions, operations));
    }
    ({ queryOptions, operations } = this.buildQuery(context, queryOptions, operations));

    const spec = await this.resolveModelSpec(context);
    const pagedResult = await this.database.get<T>(
      this.pluralResourceName,
      queryOptions,
      operations,
      spec,
    );

    const transformedEntities = (pagedResult.entities || []).map((entity) => {
      const transformedEntity: T = this.postProcessEntity(context, spec, entity);
      if (postProcessEntityCustom) {
        return postProcessEntityCustom(context, transformedEntity);
      }
      return transformedEntity as unknown as Y;
    });
    return {
      ...pagedResult,
      entities: transformedEntities,
    };
  }

  async getById(context: TContext, id: AppIdType): Promise<T>;

  async getById<TCustom extends IEntity>(
    context: TContext,
    id: AppIdType,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<TCustom>;

  async getById<Y extends IEntity = T>(
    context: TContext,
    id: AppIdType,
    prepareQueryCustom?: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y, TContext>,
  ): Promise<Y> {
    let operations: Operation[] = [];
    let queryOptions: IQueryOptions = {};

    if (prepareQueryCustom) {
      ({ operations, queryOptions } = prepareQueryCustom(context, {}, []));
    }
    ({ operations, queryOptions } = this.buildQuery(context, queryOptions, operations));

    const filters: Filters = { ...queryOptions.filters, _id: { eq: id } };
    const entity = await this.database.findOne<T>(this.pluralResourceName, filters, operations);

    if (!entity) {
      throw new IdNotFoundError();
    }

    const spec = await this.resolveModelSpec(context);
    const transformedEntity = this.postProcessEntity(context, spec, entity);
    if (postProcessEntityCustom) {
      return postProcessEntityCustom(context, transformedEntity);
    }
    return transformedEntity as unknown as Y;
  }

  async getCount(context: TContext): Promise<number> {
    const { queryOptions } = this.buildQuery(context, {});
    return this.database.getCount(this.pluralResourceName, queryOptions.filters || {});
  }

  async find(context: TContext, queryOptions: IQueryOptions): Promise<T[]> {
    const { queryOptions: preparedQuery } = this.buildQuery(context, queryOptions, []);
    const spec = await this.resolveModelSpec(context);
    const rawEntities = await this.database.find<T>(this.pluralResourceName, preparedQuery);
    return rawEntities.map((entity) => this.postProcessEntity(context, spec, entity));
  }

  async findOne(context: TContext, queryOptions: IQueryOptions): Promise<T | null> {
    const { queryOptions: preparedQuery, operations } = this.buildQuery(context, queryOptions, []);
    const spec = await this.resolveModelSpec(context);
    const rawEntity = await this.database.findOne<T>(
      this.pluralResourceName,
      preparedQuery.filters || {},
      operations,
    );
    return rawEntity ? this.postProcessEntity(context, spec, rawEntity) : null;
  }

  /**
   * Hook for query shaping only (operations, joins, filter-value normalization, options).
   * Scope filters are merged after this in buildQuery and cannot be dropped here.
   */
  prepareQuery(
    _context: TContext | undefined,
    queryOptions: IQueryOptions,
    operations: Operation[] = [],
  ): { queryOptions: IQueryOptions; operations: Operation[] } {
    const mergedOperations = (this.defaultOperations || []).concat(operations);
    return { queryOptions, operations: mergedOperations };
  }

  postProcessEntity(_context: TContext, spec: IModelSpec, entity: T): T {
    return this.database.postProcessEntity(entity, spec.fullSchema);
  }

  getModelSpec(): IModelSpec {
    return this.modelSpec;
  }
}

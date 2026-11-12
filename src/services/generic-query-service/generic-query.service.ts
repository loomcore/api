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
 * const result = await clientReportService.getById(userContext, clientId);
 * // Result will have person and email_addresses populated
 * ```
 */
import { IUserContext, IEntity, IQueryOptions, IPagedResult, IModelSpec, DefaultQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { IGenericQueryService } from './generic-query-service.interface.js';
import { Operation } from '../../databases/operations/operation.js';
import { IdNotFoundError } from '../../errors/index.js';
import { IDatabase } from '../../databases/models/index.js';
import { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../types.js';

export class GenericQueryService<T extends IEntity> implements IGenericQueryService<T> {
  protected database: IDatabase;
  protected singularResourceName: string;
  protected pluralResourceName: string;
  protected modelSpec: IModelSpec;
  protected defaultOperations: Operation[] = [];

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
  }

  async getAll(userContext: IUserContext): Promise<T[]>;

  async getAll<TCustom extends IEntity>(
    userContext: IUserContext,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
  ): Promise<TCustom[]>;

  async getAll<Y extends IEntity = T>(
    userContext: IUserContext,
    prepareQueryCustom?: PrepareQueryCustomFunction,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y>,
  ): Promise<Y[]> {
    let operations: Operation[] = [];
    let queryOptions: IQueryOptions = {};
    if (prepareQueryCustom) {
      ({ operations, queryOptions } = prepareQueryCustom(userContext, {}, []));
    }
    ({ operations, queryOptions } = this.prepareQuery(userContext, queryOptions, operations));

    const entities = await this.database.getAll<T>(operations, this.pluralResourceName, this.getTenantOrgId(userContext));

    return entities.map((entity) => {
      const dbProcessed = this.postProcessEntity(userContext, entity);
      if (postProcessEntityCustom) {
        return postProcessEntityCustom(userContext, dbProcessed);
      }
      return dbProcessed as unknown as Y;
    });
  }

  async get(userContext: IUserContext, queryOptions?: IQueryOptions): Promise<IPagedResult<T>>;

  async get<TCustom extends IEntity>(
    userContext: IUserContext,
    queryOptions: IQueryOptions,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
  ): Promise<IPagedResult<TCustom>>;

  async get<Y extends IEntity = T>(
    userContext: IUserContext,
    queryOptions: IQueryOptions = { ...DefaultQueryOptions },
    prepareQueryCustom?: PrepareQueryCustomFunction,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y>,
  ): Promise<IPagedResult<Y>> {
    let operations: Operation[] = [];
    if (prepareQueryCustom) {
      ({ queryOptions, operations } = prepareQueryCustom(userContext, queryOptions, operations));
    }
    ({ queryOptions, operations } = this.prepareQuery(userContext, queryOptions, operations));

    const pagedResult = await this.database.get<T>(
      operations,
      queryOptions,
      this.modelSpec,
      this.pluralResourceName,
    );

    const transformedEntities = (pagedResult.entities || []).map((entity) => {
      const transformedEntity: T = this.postProcessEntity(userContext, entity);
      if (postProcessEntityCustom) {
        return postProcessEntityCustom(userContext, transformedEntity);
      }
      return transformedEntity as unknown as Y;
    });
    return {
      ...pagedResult,
      entities: transformedEntities,
    };
  }

  async getById(userContext: IUserContext, id: AppIdType): Promise<T>;

  async getById<TCustom extends IEntity>(
    userContext: IUserContext,
    id: AppIdType,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
  ): Promise<TCustom>;

  async getById<Y extends IEntity = T>(
    userContext: IUserContext,
    id: AppIdType,
    prepareQueryCustom?: PrepareQueryCustomFunction,
    postProcessEntityCustom?: PostProcessEntityCustomFunction<T, Y>,
  ): Promise<Y> {
    let operations: Operation[] = [];
    let queryOptions: IQueryOptions = {};

    if (prepareQueryCustom) {
      ({ operations, queryOptions } = prepareQueryCustom(userContext, {}, []));
    }
    ({ operations, queryOptions } = this.prepareQuery(userContext, queryOptions, operations));

    const entity = await this.database.getById<T>(operations, queryOptions, id, this.pluralResourceName);

    if (!entity) {
      throw new IdNotFoundError();
    }

    const transformedEntity = this.postProcessEntity(userContext, entity);
    if (postProcessEntityCustom) {
      return postProcessEntityCustom(userContext, transformedEntity);
    }
    return transformedEntity as unknown as Y;
  }

  async getCount(userContext: IUserContext): Promise<number> {
    return this.database.getCount(this.pluralResourceName, this.getTenantOrgId(userContext));
  }

  async find(userContext: IUserContext, queryOptions: IQueryOptions): Promise<T[]> {
    const { queryOptions: preparedQuery, operations } = this.prepareQuery(userContext, queryOptions, []);

    const rawEntities = await this.database.find<T>(preparedQuery, this.pluralResourceName);

    return rawEntities.map((entity) =>
      this.postProcessEntity(userContext, entity),
    );
  }

  async findOne(userContext: IUserContext, queryOptions: IQueryOptions): Promise<T | null> {
    const { queryOptions: preparedQuery, operations } = this.prepareQuery(userContext, queryOptions, []);

    const rawEntity = await this.database.findOne<T>(preparedQuery, this.pluralResourceName);

    return rawEntity ? this.postProcessEntity(userContext, rawEntity) : null;
  }

  /**
   * This is a hook method that can be overridden by derived classes to modify queries (e.g. add tenantId).
   * It can be overridden by derived classes to provide certain operations before executing the database request.
   * @param userContext The user context for the operation
   * @param queryOptions The original query options
   * @param operations A list of operations to apply before executing the database request
   * @returns The potentially modified query options and list of operations
   */
  prepareQuery(userContext: IUserContext | undefined, queryOptions: IQueryOptions, operations: Operation[] = []): { queryOptions: IQueryOptions, operations: Operation[] } {
    // Merge default operations with provided operations
    const mergedOperations = (this.defaultOperations || []).concat(operations);
    return { queryOptions, operations: mergedOperations };
  }

  postProcessEntity(userContext: IUserContext, entity: T): T {
    return this.database.postProcessEntity(entity, this.modelSpec.fullSchema);
  }

  /**
   * Hook for subclasses to supply an organization ID for database operations that
   * enforce tenant isolation atomically. The base implementation returns undefined
   * so existing callers remain unscoped. MultiTenantQueryService overrides this.
   */
  protected getTenantOrgId(_userContext: IUserContext): AppIdType | undefined {
    return undefined;
  }

  getModelSpec(): IModelSpec {
    return this.modelSpec;
  }
}

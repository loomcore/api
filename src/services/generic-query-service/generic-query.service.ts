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
 *   'clients',  // root table
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
import { runWithTenantContext, type ITenantContext } from '../tenant-context.js';

/**
 * Extract tenant context from query options for use with AsyncLocalStorage.
 * Returns undefined orgId if no tenant filter is present.
 */
function extractTenantContext(queryOptions: IQueryOptions): ITenantContext {
  const orgIdFilter = queryOptions.filters?._orgId;
  if (orgIdFilter && typeof orgIdFilter === 'object' && 'eq' in orgIdFilter) {
    const eq = orgIdFilter.eq;
    if (typeof eq === 'string' || typeof eq === 'number') {
      return { orgId: eq };
    }
  }
  return {};
}

export class GenericQueryService<T extends IEntity> implements IGenericQueryService<T> {
  protected database: IDatabase;
  protected rootTableName: string;
  protected modelSpec: IModelSpec;
  protected defaultOperations: Operation[];

  /**
   * @constructs GenericQueryService<T> where T extends IEntity
   * @param database The database instance
   * @param rootTableName The root table name (e.g. 'clients')
   * @param modelSpec The model spec for the result type
   * @param defaultOperations Optional default operations (joins) to apply to all queries
   */
  constructor(
    database: IDatabase,
    rootTableName: string,
    modelSpec: IModelSpec,
    defaultOperations: Operation[] = []
  ) {
    this.database = database;
    this.rootTableName = rootTableName;
    this.modelSpec = modelSpec;
    this.defaultOperations = defaultOperations;
  }

  /**
   * This is a hook method that can be overridden by derived classes to modify queries (e.g. add tenantId).
   * It can be overridden by derived classes to provide certain operations before executing the database request.
   * @param userContext The user context for the operation
   * @param queryOptions The original query options
   * @param operations A list of operations to apply before executing the database request
   * @returns The potentially modified query options and list of operations
   */
  prepareQuery(userContext: IUserContext | undefined, queryOptions: IQueryOptions, operations: Operation[]): { queryOptions: IQueryOptions, operations: Operation[] } {
    // Merge default operations with provided operations
    const mergedOperations = [...this.defaultOperations, ...operations];
    return { queryOptions, operations: mergedOperations };
  }

  /**
   * Prepare query options before using them. Subclasses can override this to apply tenant filters, etc.
   * @param userContext The user context
   * @param queryOptions The original query options
   * @returns The prepared query options
   */
  prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions {
    return queryOptions;
  }

  /**
   * Post-process an entity after fetching from the database. Subclasses can override this to transform data.
   * @param userContext The user context
   * @param entity The entity to post-process
   * @returns The post-processed entity
   */
  protected postProcessEntityInternal(userContext: IUserContext, entity: any): T {
    const dbPostProcessedEntity = this.database.postProcessEntity(entity, this.modelSpec.fullSchema);

    return this.postProcessEntity(userContext, dbPostProcessedEntity);
  }

  public postProcessEntity(userContext: IUserContext, entity: any): T {
    return entity as T;
  }

  async getAll(userContext: IUserContext): Promise<T[]> {
    const { operations, queryOptions } = this.prepareQuery(userContext, {}, []);
    const tenantContext = extractTenantContext(queryOptions);

    const entities = await runWithTenantContext(tenantContext, () =>
      this.database.getAll<T>(operations, this.rootTableName)
    );

    return entities.map(entity => this.postProcessEntityInternal(userContext, entity));
  }

  async get(userContext: IUserContext, queryOptions: IQueryOptions = { ...DefaultQueryOptions }): Promise<IPagedResult<T>> {
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    const { operations } = this.prepareQuery(userContext, {}, []);

    const pagedResult = await this.database.get<T>(operations, preparedOptions, this.modelSpec, this.rootTableName);

    const transformedEntities = (pagedResult.entities || []).map(entity => this.postProcessEntityInternal(userContext, entity));

    return {
      ...pagedResult,
      entities: transformedEntities
    };
  }

  async getById(userContext: IUserContext, id: AppIdType): Promise<T> {
    const { operations, queryOptions } = this.prepareQuery(userContext, {}, []);

    const entity = await this.database.getById<T>(operations, queryOptions, id, this.rootTableName);

    if (!entity) {
      throw new IdNotFoundError();
    }

    return this.postProcessEntityInternal(userContext, entity);
  }

  async getCount(userContext: IUserContext): Promise<number> {
    const { queryOptions } = this.prepareQuery(userContext, {}, []);
    const tenantContext = extractTenantContext(queryOptions);
    return runWithTenantContext(tenantContext, () =>
      this.database.getCount(this.rootTableName)
    );
  }
}

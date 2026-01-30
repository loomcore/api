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
 * const joinPerson = new Join('persons', 'person_id', '_id', 'person');
 * const joinEmailAddresses = new JoinMany('email_addresses', 'person._id', 'person_id', 'email_addresses');
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
  postProcessEntity(userContext: IUserContext, entity: T): T {
    return this.database.postProcessEntity(entity, this.modelSpec.fullSchema);
  }

  async getAll(userContext: IUserContext): Promise<T[]> {
    const { operations } = this.prepareQuery(userContext, {}, []);

    const entities = await this.database.getAll<T>(operations, this.rootTableName);

    return entities.map(entity => this.postProcessEntity(userContext, entity));
  }

  async get(userContext: IUserContext, queryOptions: IQueryOptions = { ...DefaultQueryOptions }): Promise<IPagedResult<T>> {
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    const { operations } = this.prepareQuery(userContext, {}, []);

    const pagedResult = await this.database.get<T>(operations, preparedOptions, this.modelSpec, this.rootTableName);

    const transformedEntities = (pagedResult.entities || []).map(entity => this.postProcessEntity(userContext, entity));

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

    return this.postProcessEntity(userContext, entity);
  }

  async getCount(userContext: IUserContext): Promise<number> {
    const { operations } = this.prepareQuery(userContext, {}, []);
    return await this.database.getCount(this.rootTableName);
  }
}

import { IUserContext, IEntity, IPagedResult, IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { Operation } from '../../databases/operations/operation.js';

export interface IGenericQueryService<T extends IEntity> {
  /**
   * Prepare query before executing. Subclasses can override this to add operations, apply filters, etc.
   * @param userContext The user context for the operation
   * @param queryOptions The original query options
   * @param operations The operations (joins) to apply
   * @returns The potentially modified query options and operations
   */
  prepareQuery(userContext: IUserContext | undefined, queryOptions: IQueryOptions, operations: Operation[]): { queryOptions: IQueryOptions, operations: Operation[] };

  /**
   * Prepare query options before using them. Subclasses can override this to apply tenant filters, etc.
   * @param userContext The user context
   * @param queryOptions The original query options
   * @returns The prepared query options
   */
  prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions;

  /**
   * Post-process an entity after fetching from the database. Subclasses can override this to transform data.
   * @param userContext The user context
   * @param entity The entity to post-process
   * @returns The post-processed entity
   */
  postProcessEntity(userContext: IUserContext, entity: any): T;

  /**
   * Get all entities matching the query with joins applied
   * @param userContext The user context
   * @returns Array of all entities
   */
  getAll(userContext: IUserContext): Promise<T[]>;

  /**
   * Get paginated entities matching the query with joins applied
   * @param userContext The user context
   * @param queryOptions Query options for pagination, sorting, and filtering
   * @returns Paginated result with entities
   */
  get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<T>>;

  /**
   * Get a single entity by ID with joins applied
   * @param userContext The user context
   * @param id The ID of the entity to fetch
   * @returns The entity or throws IdNotFoundError if not found
   */
  getById(userContext: IUserContext, id: AppIdType): Promise<T>;

  /**
   * Get the count of entities matching the query with joins applied
   * @param userContext The user context
   * @returns The count of entities
   */
  getCount(userContext: IUserContext): Promise<number>;
}

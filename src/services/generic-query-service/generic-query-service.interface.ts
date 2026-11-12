import { IUserContext, IEntity, IPagedResult, IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { Operation } from '../../databases/operations/operation.js';
import { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../types.js';

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
     * Post-process an entity after fetching from the database. Subclasses can override this to transform data.
     * @param userContext The user context
     * @param entity The entity to post-process
     * @returns The post-processed entity
     */
    postProcessEntity(userContext: IUserContext, entity: any): T;

    getAll(userContext: IUserContext): Promise<T[]>;
    getAll<TCustom extends IEntity>(
        userContext: IUserContext,
        prepareQueryCustom: PrepareQueryCustomFunction,
        postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
    ): Promise<TCustom[]>;

    get(
        userContext: IUserContext,
        queryOptions?: IQueryOptions,
    ): Promise<IPagedResult<T>>;
    get<TCustom extends IEntity>(
        userContext: IUserContext,
        queryOptions: IQueryOptions,
        prepareQueryCustom: PrepareQueryCustomFunction,
        postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
    ): Promise<IPagedResult<TCustom>>;

    getById(userContext: IUserContext, id: AppIdType): Promise<T>;
    getById<TCustom extends IEntity>(
        userContext: IUserContext,
        id: AppIdType,
        prepareQueryCustom: PrepareQueryCustomFunction,
        postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>,
    ): Promise<TCustom>;

    /**
     * Get the count of entities matching the query with joins applied
     * @param userContext The user context
     * @returns The count of entities
     */
    getCount(userContext: IUserContext): Promise<number>;

    find(
        userContext: IUserContext,
        queryObject: IQueryOptions,
        options?: any,
    ): Promise<T[]>;
    findOne(
        userContext: IUserContext,
        queryObject: IQueryOptions,
        options?: any,
    ): Promise<T | null>;
}

import type { IEntity, IPagedResult, IQueryOptions, IModelSpec } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { Operation } from '../../databases/operations/operation.js';
import type { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../types.js';
import type { IRequestContext } from '../request-context.interface.js';

export interface IGenericQueryService<T extends IEntity, TContext extends IRequestContext = IRequestContext> {
  /**
   * Prepare query before executing. Query shaping only (operations, joins, filter-value normalization).
   * Scope filters are merged after prepareQuery and cannot be dropped by an override.
   */
  prepareQuery(context: TContext | undefined, queryOptions: IQueryOptions, operations: Operation[]): { queryOptions: IQueryOptions; operations: Operation[] };

  /**
   * Post-process an entity after fetching from the database. Uses the resolved model spec.
   */
  postProcessEntity(context: TContext, spec: IModelSpec, entity: any): T;

  /** Resolves the model spec once per request (memoized on the context object). */
  resolveModelSpec(context: TContext): Promise<IModelSpec>;

  getAll(context: TContext): Promise<T[]>;
  getAll<TCustom extends IEntity>(
    context: TContext,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<TCustom[]>;

  get(context: TContext, queryOptions?: IQueryOptions): Promise<IPagedResult<T>>;
  get<TCustom extends IEntity>(
    context: TContext,
    queryOptions: IQueryOptions,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<IPagedResult<TCustom>>;

  getById(context: TContext, id: AppIdType): Promise<T>;
  getById<TCustom extends IEntity>(
    context: TContext,
    id: AppIdType,
    prepareQueryCustom: PrepareQueryCustomFunction<TContext>,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom, TContext>,
  ): Promise<TCustom>;

  getCount(context: TContext): Promise<number>;

  find(context: TContext, queryObject: IQueryOptions): Promise<T[]>;
  findOne(context: TContext, queryObject: IQueryOptions): Promise<T | null>;
}

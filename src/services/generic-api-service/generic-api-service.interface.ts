import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IPagedResult, IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { DeleteResult } from '../../databases/models/delete-result.js';
import { Operation } from '../../databases/operations/operation.js';
import { PostProcessEntityCustomFunction, PrepareQueryCustomFunction } from '../../controllers/types.js';

export interface IGenericApiService<T extends IEntity> {
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;

  prepareQuery(userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] };
  preProcessEntity(userContext: IUserContext, entity: Partial<T>, isCreate: boolean, allowId: boolean): Promise<Partial<T>>;
  postProcessEntity(userContext: IUserContext, entity: T): T;

  getAll(userContext: IUserContext): Promise<T[]>;
  getAll<TCustom extends IEntity>(
    userContext: IUserContext,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>
  ): Promise<TCustom[]>;

  get(userContext: IUserContext, queryOptions?: IQueryOptions): Promise<IPagedResult<T>>;
  get<TCustom extends IEntity>(
    userContext: IUserContext,
    queryOptions: IQueryOptions,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>
  ): Promise<IPagedResult<TCustom>>;

  getById(userContext: IUserContext, id: AppIdType): Promise<T>;
  getById<TCustom extends IEntity>(
    userContext: IUserContext,
    id: AppIdType,
    prepareQueryCustom: PrepareQueryCustomFunction,
    postProcessEntityCustom: PostProcessEntityCustomFunction<T, TCustom>
  ): Promise<TCustom>;
  getCount(userContext: IUserContext): Promise<number>;
  create(userContext: IUserContext, entity: Partial<T>): Promise<T | null>;
  createMany(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  fullUpdateById(userContext: IUserContext, id: AppIdType, entity: T): Promise<T>;
  partialUpdateById(userContext: IUserContext, id: AppIdType, entity: Partial<T>): Promise<T>;
  partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: AppIdType, entity: T): Promise<T>;
  update(userContext: IUserContext, queryObject: IQueryOptions, entity: Partial<T>): Promise<T[]>;
  deleteById(userContext: IUserContext, id: AppIdType): Promise<DeleteResult>;
  deleteMany(userContext: IUserContext, queryObject: IQueryOptions): Promise<DeleteResult>;
  find(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T[]>;
  findOne(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T | null>;
}

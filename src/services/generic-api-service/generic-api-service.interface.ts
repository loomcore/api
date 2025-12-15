import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IPagedResult, IQueryOptions } from '@loomcore/common/models';
import { DeleteResult } from '../../databases/models/delete-result.js';
import { Operation } from '../../databases/operations/operation.js';

export interface IGenericApiService<TInput extends IEntity, TOutput extends IEntity> {
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;

  prepareQuery(userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] };
  preprocessEntity(userContext: IUserContext, entity: Partial<TInput>, isCreate: boolean, allowId: boolean): Promise<Partial<TInput>>;
  postprocessEntity(userContext: IUserContext, entity: TInput): TOutput;

  getAll(userContext: IUserContext): Promise<TOutput[]>;
  get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<TOutput>>;
  getById(userContext: IUserContext, id: string): Promise<TOutput>;
  getCount(userContext: IUserContext): Promise<number>;
  create(userContext: IUserContext, entity: Partial<TInput>): Promise<TOutput | null>;
  createMany(userContext: IUserContext, entities: Partial<TInput>[]): Promise<TOutput[]>;
  batchUpdate(userContext: IUserContext, entities: Partial<TInput>[]): Promise<TOutput[]>;
  fullUpdateById(userContext: IUserContext, id: string, entity: TInput): Promise<TOutput>;
  partialUpdateById(userContext: IUserContext, id: string, entity: Partial<TInput>): Promise<TOutput>;
  partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: string, entity: TInput): Promise<TOutput>;
  update(userContext: IUserContext, queryObject: IQueryOptions, entity: Partial<TInput>): Promise<TOutput[]>;
  deleteById(userContext: IUserContext, id: string): Promise<DeleteResult>;
  deleteMany(userContext: IUserContext, queryObject: IQueryOptions): Promise<DeleteResult>;
  find(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<TOutput[]>;
  findOne(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<TOutput | null>;
}

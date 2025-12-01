import { ValueError } from '@sinclair/typebox/errors';
import {IUserContext, IEntity, IPagedResult, IQueryOptions} from '@loomcore/common/models';
import { DeleteResult } from '../../databases/models/delete-result.js';
import { Operation } from '../../databases/operations/operation.js';

export interface IGenericApiService<T extends IEntity> {
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;
  
  prepareQuery(userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] };
  preprocessEntity(userContext: IUserContext, entity: Partial<T>, isCreate: boolean, allowId: boolean): Promise<Partial<T>>;
  postprocessEntity(userContext: IUserContext, entity: T): T;

  getAll(userContext: IUserContext): Promise<T[]>;
  get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<T>>;
  getById(userContext: IUserContext, id: string): Promise<T>;
  getCount(userContext: IUserContext): Promise<number>;
  create(userContext: IUserContext, entity: Partial<T>): Promise<T | null>;
  createMany(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T>;
  partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T>;
  partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: string, entity: T): Promise<T>;
  update(userContext: IUserContext, queryObject: IQueryOptions, entity: Partial<T>): Promise<T[]>;
  deleteById(userContext: IUserContext, id: string): Promise<DeleteResult>;
  deleteMany(userContext: IUserContext, queryObject: IQueryOptions): Promise<DeleteResult>;
  find(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T[]>;
  findOne(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T | null>;
}

import { ValueError } from '@sinclair/typebox/errors';
import {IUserContext, IEntity, IPagedResult, IQueryOptions} from '@loomcore/common/models';
import { DeleteResult } from '../../databases/types/deleteResult.js';
import { Operation } from '../../databases/operations/operation.js';

export interface IGenericApiService<T extends IEntity> {
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;
  
  prepareQuery(userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] };

  prepareEntity(userContext: IUserContext, entity: T, isCreate: boolean, allowId: boolean): Promise<T>;
  prepareEntity(userContext: IUserContext, entity: Partial<T>, isCreate: boolean, allowId: boolean): Promise<Partial<T>>;
  prepareEntities(userContext: IUserContext, entities: T[], isCreate: boolean, allowId: boolean): Promise<T[]>;
  prepareEntities(userContext: IUserContext, entities: Partial<T>[], isCreate: boolean, allowId: boolean): Promise<Partial<T>[]>;
  
  processEntity(userContext: IUserContext, entity: T): T;
  processEntities(userContext: IUserContext, entities: T[]): T[];

  getAll(userContext: IUserContext): Promise<T[]>;
  get(userContext: IUserContext, queryOptions: IQueryOptions): Promise<IPagedResult<T>>;
  getById(userContext: IUserContext, id: string): Promise<T>;
  getCount(userContext: IUserContext): Promise<number>;
  create(userContext: IUserContext, entity: T | Partial<T>): Promise<T | null>;
  createMany(userContext: IUserContext, entities: T[]): Promise<T[]>;
  batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]>;
  fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T>;
  partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T>;
  partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, entity: T): Promise<T>;
  update(userContext: IUserContext, queryObject: IQueryOptions, entity: Partial<T>): Promise<T[]>;
  deleteById(userContext: IUserContext, id: string): Promise<DeleteResult>;
  deleteMany(userContext: IUserContext, queryObject: IQueryOptions): Promise<DeleteResult>;
  find(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T[]>;
  findOne(userContext: IUserContext, queryObject: IQueryOptions, options?: any): Promise<T | null>;
}

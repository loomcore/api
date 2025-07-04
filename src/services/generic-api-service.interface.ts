import {DeleteResult, Document, FindOptions} from 'mongodb';
import { ValueError } from '@sinclair/typebox/errors';
import {IUserContext, IEntity, IPagedResult, QueryOptions} from '@loomcore/common/models';

export interface IGenericApiService<T extends IEntity> {
  validate(doc: any, isPartial?: boolean): ValueError[] | null;
  validateMany(docs: any[], isPartial?: boolean): ValueError[] | null;
  /**
   * Prepares data for database storage by handling schema stripping, auditing, and type conversion
   * @param userContext The user context for the operation
   * @param entity The entity or array of entities to prepare
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @returns The prepared entity or entities
   */
  prepareDataForDb(userContext: IUserContext, entity: T, isCreate?: boolean): Promise<T>;
  prepareDataForDb(userContext: IUserContext, entity: Partial<T>, isCreate?: boolean): Promise<Partial<T>>;
  prepareDataForDb(userContext: IUserContext, entity: T[], isCreate?: boolean): Promise<T[]>;
  prepareDataForDb(userContext: IUserContext, entity: Partial<T>[], isCreate?: boolean): Promise<Partial<T>[]>;
  getAll(userContext: IUserContext): Promise<T[]>;
	get(userContext: IUserContext, queryOptions: QueryOptions): Promise<IPagedResult<T>>;
  getById(userContext: IUserContext, id: string): Promise<T>;
	getCount(userContext: IUserContext): Promise<number>;
	create(userContext: IUserContext, item: T): Promise<T | null>;
  createMany(userContext: IUserContext, items: T[]): Promise<T[]>;
  fullUpdateById(userContext: IUserContext, id: string, item: T): Promise<T>;
	partialUpdateById(userContext: IUserContext, id: string, item: Partial<T>): Promise<T>;
  partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, item: Partial<T>): Promise<T>;
  update(userContext: IUserContext, queryObject: any, item: Partial<T>): Promise<T[]>;
  deleteById(userContext: IUserContext, id: string): Promise<DeleteResult>;
  deleteMany(userContext: IUserContext, queryObject: any): Promise<DeleteResult>;
  find(userContext: IUserContext, mongoQueryObject: any, options?: FindOptions<Document> | undefined): Promise<T[]>;
  findOne(userContext: IUserContext, mongoQueryObject: any, options?: FindOptions<Document> | undefined): Promise<T>;
}

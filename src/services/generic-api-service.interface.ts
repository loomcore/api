import {DeleteResult, Document, FindOptions} from 'mongodb';
import {IUserContext} from '../models/user-context.model.js';
import {IEntity} from '../models/entity.model.js';
import {IPagedResult} from '../models/paged-result.interface.js';
import {QueryOptions} from '../models/query-options.model.js';    

export interface IGenericApiService<T extends IEntity> {
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

import { IModelSpec, IQueryOptions, IPagedResult, IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { TSchema } from '@sinclair/typebox';
import { DeleteResult } from './delete-result.js';
import { Operation } from '../operations/operation.js';
import type { Filters } from '../../services/filters.type.js';

/**
 * Database executes filters and knows nothing about tenants or content types.
 * Trailing orgId parameters are removed; callers supply scope via Filters.
 */
export interface IDatabase {
  close(): Promise<void>;
  preProcessEntity<T extends IEntity>(entity: Partial<T>, modelSpec: TSchema): Partial<T>;
  postProcessEntity<T extends IEntity>(entity: T, modelSpec: TSchema): T;

  getAll<T extends IEntity>(collection: string, filters: Filters, operations: Operation[]): Promise<T[]>;
  get<T extends IEntity>(collection: string, queryOptions: IQueryOptions, operations: Operation[], modelSpec: IModelSpec): Promise<IPagedResult<T>>;
  findOne<T extends IEntity>(collection: string, filters: Filters, operations?: Operation[]): Promise<T | null>;
  find<T extends IEntity>(collection: string, queryOptions: IQueryOptions): Promise<T[]>;
  getCount(collection: string, filters: Filters): Promise<number>;

  create<T extends IEntity>(collection: string, entity: Partial<T>): Promise<{ insertedId: AppIdType; entity: T }>;
  createMany<T extends IEntity>(collection: string, entities: Partial<T>[]): Promise<{ insertedIds: AppIdType[]; entities: T[] }>;

  /** Was fullUpdateById. Throws IdNotFoundError when the filter matches nothing. */
  replaceOne<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T>;
  /** Was partialUpdateById. Throws IdNotFoundError when the filter matches nothing. */
  updateOne<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T>;
  /** Was update. */
  updateMany<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T[]>;
  batchUpdate<T extends IEntity>(collection: string, filters: Filters, entities: Partial<T>[], operations: Operation[]): Promise<T[]>;
  /** Was deleteById. */
  deleteOne(collection: string, filters: Filters): Promise<DeleteResult>;
  deleteMany(collection: string, filters: Filters): Promise<DeleteResult>;
}

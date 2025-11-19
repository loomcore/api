import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "./operations/operation.js";
import { DeleteResult } from "./types/deleteResult.js";
import { TSchema } from "@sinclair/typebox";

export interface IDatabase {
  getAll<T>(operations: Operation[]): Promise<T[]>;
  get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>>;
  getById<T>(operations: Operation[], id: string): Promise<T | null>;
  getCount(operations: Operation[]): Promise<number>;
  create<T>(entity: Partial<T>): Promise<{ insertedId: string; entity: T }>;
  createMany<T>(entities: Partial<T>[]): Promise<{ insertedIds: string[]; entities: T[] }>;
  prepareData<T>(entity: T, modelSpec: TSchema): T;
  processData<T>(entity: T, modelSpec: TSchema): T;
  batchUpdate<T>(entities: Partial<T>[], operations: Operation[]): Promise<T[]>;
  fullUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>): Promise<T>;
  partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>): Promise<T>;
  update<T>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[]): Promise<T[]>;
  deleteById(id: string): Promise<DeleteResult>;
  deleteMany(queryObject: IQueryOptions): Promise<DeleteResult>;
  find<T>(queryObject: IQueryOptions): Promise<T[]>;
  findOne<T>(queryObject: IQueryOptions): Promise<T | null>;
}
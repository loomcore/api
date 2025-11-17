import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../operations/operations.js";

export interface IDatabase {
  getAll<T>(operations: Operation[]): Promise<T[]>;
  get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>>;
  getById<T>(operations: Operation[], id: string): Promise<T | null>;
  getCount(operations: Operation[]): Promise<number>;
  transformSingle<T>(single: T, modelSpec: IModelSpec): T;
  create<T>(entity: any): Promise<{ insertedId: any; entity: any }>;
  createMany<T>(entities: any[]): Promise<{ insertedIds: any; entities: any[] }>;
  prepareEntity<T>(entity: T): Promise<T>;
  batchUpdate<T>(entities: Partial<T>[], operations: Operation[]): Promise<T[]>;
  fullUpdateById<T>(operations: Operation[], id: string, entity: any): Promise<T>;
  partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<any>): Promise<T>;
}
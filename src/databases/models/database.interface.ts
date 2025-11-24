import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { DeleteResult } from "./delete-result.js";
import { TSchema } from "@sinclair/typebox";
import { Operation } from "../operations/operation.js";

export interface IDatabase {
  preprocessEntity<T>(entity: T, modelSpec: TSchema): T;
  postprocessEntity<T>(entity: T, modelSpec: TSchema): T;
  getAll<T>(operations: Operation[], pluralResourceName: string): Promise<T[]>;
  get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>>;
  getById<T>(operations: Operation[], id: string, pluralResourceName: string): Promise<T | null>;
  getCount(operations: Operation[], pluralResourceName: string): Promise<number>;
  create<T>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: string; entity: T }>;
  createMany<T>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: string[]; entities: T[] }>;
  batchUpdate<T>(entities: Partial<T>[], operations: Operation[], pluralResourceName: string): Promise<T[]>;
  fullUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  update<T>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]>;
  deleteById(id: string, pluralResourceName: string): Promise<DeleteResult>;
  deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<DeleteResult>;
  find<T>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]>;
  findOne<T>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null>;
}
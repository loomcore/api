import { IModelSpec, IQueryOptions, IPagedResult, IEntity } from "@loomcore/common/models";
import { DeleteResult } from "./delete-result.js";
import { TSchema } from "@sinclair/typebox";
import { Operation } from "../operations/operation.js";

export interface IDatabase {
  preprocessEntity<T extends IEntity>(entity: Partial<T>, modelSpec: TSchema): Partial<T>;
  postprocessEntity<T extends IEntity>(entity: T, modelSpec: TSchema): T;
  getAll<T>(operations: Operation[], pluralResourceName: string): Promise<T[]>;
  get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>>;
  getById<T>(operations: Operation[], queryObject: IQueryOptions, id: string, pluralResourceName: string): Promise<T | null>;
  getCount(pluralResourceName: string): Promise<number>;
  create<T extends IEntity>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: string; entity: T }>;
  createMany<T extends IEntity>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: string[]; entities: T[] }>;
  batchUpdate<T extends IEntity>(entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]>;
  fullUpdateById<T extends IEntity>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  partialUpdateById<T extends IEntity>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T>;
  update<T extends IEntity>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]>;
  deleteById(id: string, pluralResourceName: string): Promise<DeleteResult>;
  deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<DeleteResult>;
  find<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]>;
  findOne<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null>;
}
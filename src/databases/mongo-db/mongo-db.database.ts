import { Collection, Db, Document } from "mongodb";
import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../operations/operation.js";
import { convertObjectIdsToStrings, convertStringsToObjectIds } from "./utils/index.js";
import { DeleteResult as GenericDeleteResult } from "../models/delete-result.js";
import { TSchema } from "@sinclair/typebox";
import { IDatabase } from "../models/database.interface.js";
import { create, createMany, batchUpdate, fullUpdateById, partialUpdateById, update, deleteById, deleteMany } from "./commands/index.js";
import { getAll, get, getById, getCount, find, findOne } from "./queries/index.js";

export class MongoDBDatabase implements IDatabase {
    private db: Db;

    constructor(
        db: Db,
    ) {
        this.db = db;
    }

    preprocessEntity<T>(entity: T, schema: TSchema): T {
        return convertStringsToObjectIds(entity, schema);
    }

    postprocessEntity<T>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single, schema);
    }

    async getAll<T>(operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return getAll<T>(this.db, operations, pluralResourceName);
    }

    async get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
        return get<T>(this.db, operations, queryOptions, modelSpec, pluralResourceName);
    }

    async getById<T>(operations: Operation[], id: string, pluralResourceName: string): Promise<T | null> {
        return getById<T>(this.db, operations, id, pluralResourceName);
    }

    async getCount(operations: Operation[], pluralResourceName: string): Promise<number> {
        return getCount(this.db, operations, pluralResourceName);
    }

    async create<T>(entity: any, pluralResourceName: string): Promise<{ insertedId: any; entity: any }> {
        return create<T>(this.db, pluralResourceName, entity);
    }

    async createMany<T>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: any; entities: any[] }> {
        return createMany<T>(this.db, pluralResourceName, entities);
    }

    async batchUpdate<T>(entities: Partial<T>[], operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return batchUpdate<T>(this.db, entities, operations, pluralResourceName);
    }

    async fullUpdateById<T>(operations: Operation[], id: string, entity: any, pluralResourceName: string): Promise<T> {
        return fullUpdateById<T>(this.db, operations, id, entity, pluralResourceName);
    }

    async partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<any>, pluralResourceName: string): Promise<T> {
        return partialUpdateById<T>(this.db, operations, id, entity, pluralResourceName);
    }

    async update<T>(queryObject: IQueryOptions, entity: Partial<any>, operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return update<T>(this.db, queryObject, entity, operations, pluralResourceName);
    }

    async deleteById(id: string, pluralResourceName: string): Promise<GenericDeleteResult> {
        return deleteById(this.db, id, pluralResourceName);
    }

    async deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<GenericDeleteResult> {
        return deleteMany(this.db, queryObject, pluralResourceName);
    }

    async find<T>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return find<T>(this.db, queryObject, pluralResourceName);
    }

    async findOne<T>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null> {
        return findOne<T>(this.db, queryObject, pluralResourceName);
    }
};


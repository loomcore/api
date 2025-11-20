import { Collection, Db } from "mongodb";
import { IModelSpec, IQueryOptions, IPagedResult } from "@loomcore/common/models";
import { Operation } from "../operations/operation.js";
import { convertObjectIdsToStrings, convertStringsToObjectIds } from "./utils/index.js";
import { DeleteResult as GenericDeleteResult } from "../models/deleteResult.js";
import { TSchema } from "@sinclair/typebox";
import { IDatabase } from "../models/database.interface.js";
import { create, createMany, batchUpdate, fullUpdateById, partialUpdateById, update, deleteById, deleteMany } from "./commands/index.js";
import { getAll, get, getById, getCount, find, findOne } from "./queries/index.js";

export class MongoDBDatabase implements IDatabase {
    private collection: Collection;
    private pluralResourceName: string;

    constructor(
        db: Db,
        pluralResourceName: string,
    ) {
        this.collection = db.collection(pluralResourceName);
        this.pluralResourceName = pluralResourceName;
    }

    preprocessEntity<T>(entity: T, schema: TSchema): T {
        return convertStringsToObjectIds(entity, schema);
    }


    postprocessEntity<T>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single, schema);
    }

    async getAll<T>(operations: Operation[]): Promise<T[]> {
        return getAll<T>(this.collection, operations);
    }

    async get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>> {
        return get<T>(this.collection, operations, queryOptions, modelSpec);
    }

    async getById<T>(operations: Operation[], id: string): Promise<T | null> {
        return getById<T>(this.collection, operations, id);
    }

    async getCount(operations: Operation[]): Promise<number> {
        return getCount(this.collection, operations);
    }

    async create<T>(entity: any): Promise<{ insertedId: any; entity: any }> {
        return create<T>(this.collection, this.pluralResourceName, entity);
    }

    async createMany<T>(entities: Partial<T>[]): Promise<{ insertedIds: any; entities: any[] }> {
        return createMany<T>(this.collection, this.pluralResourceName, entities);
    }

    async batchUpdate<T>(entities: Partial<T>[], operations: Operation[]): Promise<T[]> {
        return batchUpdate<T>(this.collection, entities, operations);
    }

    async fullUpdateById<T>(operations: Operation[], id: string, entity: any): Promise<T> {
        return fullUpdateById<T>(this.collection, operations, id, entity);
    }

    async partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<any>): Promise<T> {
        return partialUpdateById<T>(this.collection, operations, id, entity);
    }

    async update<T>(queryObject: IQueryOptions, entity: Partial<any>, operations: Operation[]): Promise<T[]> {
        return update<T>(this.collection, queryObject, entity, operations);
    }

    async deleteById(id: string): Promise<GenericDeleteResult> {
        return deleteById(this.collection, id);
    }

    async deleteMany(queryObject: IQueryOptions): Promise<GenericDeleteResult> {
        return deleteMany(this.collection, queryObject);
    }

    async find<T>(queryObject: IQueryOptions): Promise<T[]> {
        return find<T>(this.collection, queryObject);
    }

    async findOne<T>(queryObject: IQueryOptions): Promise<T | null> {
        return findOne<T>(this.collection, queryObject);
    }
};


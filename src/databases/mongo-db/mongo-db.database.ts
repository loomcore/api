import { Db } from "mongodb";
import { IModelSpec, IQueryOptions, IPagedResult, IEntity } from "@loomcore/common/models";
import { Operation } from "../operations/operation.js";
import { convertObjectIdsToStrings, convertStringsToObjectIds } from "./utils/index.js";
import { DeleteResult as GenericDeleteResult } from "../models/delete-result.js";
import { TSchema } from "@sinclair/typebox";
import { IDatabase } from "../models/database.interface.js";
import { create, createMany, batchUpdate, fullUpdateById, partialUpdateById, update, deleteById, deleteMany } from "./commands/index.js";
import { getAll, get, getById, getCount, find, findOne } from "./queries/index.js";
import { entityUtils } from "@loomcore/common/utils";
import { BadRequestError } from "../../errors/bad-request.error.js";

export class MongoDBDatabase implements IDatabase {
    private db: Db;

    constructor(
        db: Db,
    ) {
        this.db = db;
    }

    preprocessEntity<T extends IEntity>(entity: Partial<T>, schema: TSchema): Partial<T> {
        if (entity._id && !entityUtils.isValidObjectId(entity._id)) {
            throw new BadRequestError('id is not a valid ObjectId');
        }
        return convertStringsToObjectIds(entity, schema);
    }

    postprocessEntity<T extends IEntity>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single);
    }

    async getAll<T extends IEntity>(operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return getAll<T>(this.db, operations, pluralResourceName);
    }

    async get<T extends IEntity>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
        return get<T>(this.db, operations, queryOptions, modelSpec, pluralResourceName);
    }

    async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: string, pluralResourceName: string): Promise<T | null> {
        return getById<T>(this.db, operations, queryObject, id, pluralResourceName);
    }

    async getCount(pluralResourceName: string): Promise<number> {
        return getCount(this.db, pluralResourceName);
    }

    async create<T extends IEntity>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: string; entity: T }> {
        return create<T>(this.db, pluralResourceName, entity);
    }

    async createMany<T extends IEntity>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: string[]; entities: T[] }> {
        return createMany<T>(this.db, pluralResourceName, entities);
    }

    async batchUpdate<T extends IEntity>(entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return batchUpdate<T>(this.db, entities, operations, queryObject, pluralResourceName);
    }

    async fullUpdateById<T extends IEntity>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        return fullUpdateById<T>(this.db, operations, id, entity, pluralResourceName);
    }

    async partialUpdateById<T extends IEntity>(operations: Operation[], id: string, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        return partialUpdateById<T>(this.db, operations, id, entity, pluralResourceName);
    }

    async update<T extends IEntity>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return update<T>(this.db, queryObject, entity, operations, pluralResourceName);
    }

    async deleteById(id: string, pluralResourceName: string): Promise<GenericDeleteResult> {
        return deleteById(this.db, id, pluralResourceName);
    }

    async deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<GenericDeleteResult> {
        return deleteMany(this.db, queryObject, pluralResourceName);
    }

    async find<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return find<T>(this.db, queryObject, pluralResourceName);
    }

    async findOne<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null> {
        return findOne<T>(this.db, queryObject, pluralResourceName);
    }
};


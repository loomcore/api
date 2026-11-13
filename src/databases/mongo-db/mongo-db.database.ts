import { Db, MongoClient } from 'mongodb';
import { IModelSpec, IQueryOptions, IPagedResult, IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { Operation } from '../operations/operation.js';
import { convertObjectIdsToStrings, convertStringsToObjectIds } from './utils/index.js';
import { DeleteResult as GenericDeleteResult } from '../models/delete-result.js';
import { TSchema } from '@sinclair/typebox';
import { IDatabase } from '../models/database.interface.js';
import { create, createMany, batchUpdate, replaceOne, updateOne, updateMany, deleteOne, deleteMany } from './commands/index.js';
import { getAll, get, getCount, find, findOne } from './queries/index.js';
import { entityUtils } from '@loomcore/common/utils';
import { BadRequestError } from '../../errors/bad-request.error.js';
import type { Filters } from '../../services/filters.type.js';

export class MongoDBDatabase implements IDatabase {
    private db: Db;
    private mongoClient?: MongoClient;

    /**
     * @param db — Database handle used for queries/commands.
     * @param mongoClient — Optional. Pass when this instance should own shutdown via {@link close}.
     */
    constructor(
        db: Db,
        mongoClient?: MongoClient,
    ) {
        this.db = db;
        this.mongoClient = mongoClient;
    }

    /**
     * Closes the MongoClient when one was provided to the constructor; otherwise no-op.
     */
    async close(): Promise<void> {
        if (this.mongoClient) {
            await this.mongoClient.close();
        }
    }

    preProcessEntity<T extends IEntity>(entity: Partial<T>, schema: TSchema): Partial<T> {
        // Allow already-converted ObjectId instances (write pipeline may call this twice: once in
        // preProcessEntity and again after applyScopesToEntity stamps camelCase fields).
        if (entity._id && typeof entity._id === 'string' && !entityUtils.isValidObjectId(entity._id)) {
            throw new BadRequestError('id is not a valid ObjectId');
        }
        return convertStringsToObjectIds(entity, schema);
    }

    postProcessEntity<T extends IEntity>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single);
    }

    async getAll<T extends IEntity>(collection: string, filters: Filters, operations: Operation[]): Promise<T[]> {
        return getAll<T>(this.db, collection, filters, operations);
    }

    async get<T extends IEntity>(collection: string, queryOptions: IQueryOptions, operations: Operation[], modelSpec: IModelSpec): Promise<IPagedResult<T>> {
        return get<T>(this.db, collection, queryOptions, operations, modelSpec);
    }

    async findOne<T extends IEntity>(collection: string, filters: Filters, operations?: Operation[]): Promise<T | null> {
        return findOne<T>(this.db, collection, filters, operations);
    }

    async find<T extends IEntity>(collection: string, queryOptions: IQueryOptions): Promise<T[]> {
        return find<T>(this.db, collection, queryOptions);
    }

    async getCount(collection: string, filters: Filters): Promise<number> {
        return getCount(this.db, collection, filters);
    }

    async create<T extends IEntity>(collection: string, entity: Partial<T>): Promise<{ insertedId: AppIdType; entity: T }> {
        return create<T>(this.db, collection, entity);
    }

    async createMany<T extends IEntity>(collection: string, entities: Partial<T>[]): Promise<{ insertedIds: AppIdType[]; entities: T[] }> {
        return createMany<T>(this.db, collection, entities);
    }

    async replaceOne<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T> {
        return replaceOne<T>(this.db, collection, filters, entity, operations);
    }

    async updateOne<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T> {
        return updateOne<T>(this.db, collection, filters, entity, operations);
    }

    async updateMany<T extends IEntity>(collection: string, filters: Filters, entity: Partial<T>, operations: Operation[]): Promise<T[]> {
        return updateMany<T>(this.db, collection, filters, entity, operations);
    }

    async batchUpdate<T extends IEntity>(collection: string, filters: Filters, entities: Partial<T>[], operations: Operation[]): Promise<T[]> {
        return batchUpdate<T>(this.db, collection, filters, entities, operations);
    }

    async deleteOne(collection: string, filters: Filters): Promise<GenericDeleteResult> {
        return deleteOne(this.db, collection, filters);
    }

    async deleteMany(collection: string, filters: Filters): Promise<GenericDeleteResult> {
        return deleteMany(this.db, collection, filters);
    }
};

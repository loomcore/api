import { Db, MongoClient } from 'mongodb';
import { IModelSpec, IQueryOptions, IPagedResult, IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { Operation } from '../operations/operation.js';
import { convertObjectIdsToStrings, convertStringsToObjectIds } from './utils/index.js';
import { DeleteResult as GenericDeleteResult } from '../models/delete-result.js';
import { TSchema } from '@sinclair/typebox';
import { IDatabase } from '../models/database.interface.js';
import { create, createMany, batchUpdate, fullUpdateById, partialUpdateById, update, deleteById, deleteMany } from './commands/index.js';
import { getAll, get, getById, getCount, find, findOne } from './queries/index.js';
import { entityUtils } from '@loomcore/common/utils';
import { BadRequestError } from '../../errors/bad-request.error.js';
import { getTenantOrgId } from '../../services/tenant-context.js';

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

    /**
     * Build query options with tenant filtering from the current AsyncLocalStorage context.
     * If no tenant context is set, returns empty query options (no filtering).
     */
    private buildTenantQueryOptions(): IQueryOptions {
        const orgId = getTenantOrgId();
        if (orgId === undefined) {
            return {};
        }
        return { filters: { _orgId: { eq: orgId } } };
    }

    preProcessEntity<T extends IEntity>(entity: Partial<T>, schema: TSchema): Partial<T> {
        if (entity._id && !entityUtils.isValidObjectId(entity._id)) {
            throw new BadRequestError('id is not a valid ObjectId');
        }
        return convertStringsToObjectIds(entity, schema);
    }

    postProcessEntity<T extends IEntity>(single: T, schema: TSchema): T {
        if (!single) return single;

        return convertObjectIdsToStrings<T>(single);
    }

    async getAll<T extends IEntity>(operations: Operation[], pluralResourceName: string): Promise<T[]> {
        const tenantQueryOptions = this.buildTenantQueryOptions();
        return getAll<T>(this.db, operations, tenantQueryOptions, pluralResourceName);
    }

    async get<T extends IEntity>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
        return get<T>(this.db, operations, queryOptions, modelSpec, pluralResourceName);
    }

    async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppIdType, pluralResourceName: string): Promise<T | null> {
        return getById<T>(this.db, operations, queryObject, id, pluralResourceName);
    }

    async getCount(pluralResourceName: string): Promise<number> {
        const tenantQueryOptions = this.buildTenantQueryOptions();
        return getCount(this.db, tenantQueryOptions, pluralResourceName);
    }

    async create<T extends IEntity>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: AppIdType; entity: T }> {
        return create<T>(this.db, pluralResourceName, entity);
    }

    async createMany<T extends IEntity>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: AppIdType[]; entities: T[] }> {
        return createMany<T>(this.db, pluralResourceName, entities);
    }

    async batchUpdate<T extends IEntity>(entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return batchUpdate<T>(this.db, entities, operations, queryObject, pluralResourceName);
    }

    async fullUpdateById<T extends IEntity>(operations: Operation[], id: AppIdType, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        const tenantQueryOptions = this.buildTenantQueryOptions();
        return fullUpdateById<T>(this.db, operations, tenantQueryOptions, id, entity, pluralResourceName);
    }

    async partialUpdateById<T extends IEntity>(operations: Operation[], id: AppIdType, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        const tenantQueryOptions = this.buildTenantQueryOptions();
        return partialUpdateById<T>(this.db, operations, tenantQueryOptions, id, entity, pluralResourceName);
    }

    async update<T extends IEntity>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return update<T>(this.db, queryObject, entity, operations, pluralResourceName);
    }

    async deleteById(id: AppIdType, pluralResourceName: string): Promise<GenericDeleteResult> {
        const tenantQueryOptions = this.buildTenantQueryOptions();
        return deleteById(this.db, tenantQueryOptions, id, pluralResourceName);
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

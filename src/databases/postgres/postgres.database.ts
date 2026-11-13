import {
    IEntity,
    IModelSpec,
    IPagedResult,
    IQueryOptions,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { TSchema } from '@sinclair/typebox';
import { DeleteResult, IDatabase } from '../models/index.js';
import { Operation } from '../operations/operation.js';
import type { Filters } from '../../services/filters.type.js';
import { batchUpdate as batchUpdateCommand } from './commands/postgres-batch-update.command.js';
import { create as createCommand } from './commands/postgres-create.command.js';
import { createMany as createManyCommand } from './commands/postgres-create-many.command.js';
import { deleteMany as deleteManyCommand } from './commands/postgres-delete-many.command.js';
import { deleteOne as deleteOneCommand } from './commands/postgres-delete-one.command.js';
import { replaceOne as replaceOneCommand } from './commands/postgres-replace-one.command.js';
import { updateMany as updateManyCommand } from './commands/postgres-update-many.command.js';
import { updateOne as updateOneCommand } from './commands/postgres-update-one.command.js';
import type { PostgresConnection } from './postgres-connection.js';
import { find as findQuery } from './queries/postgres-find.query.js';
import { findOne as findOneQuery } from './queries/postgres-find-one.query.js';
import { get as getQuery } from './queries/postgres-get.query.js';
import { getAll as getAllQuery } from './queries/postgres-get-all.query.js';
import { getCount as getCountQuery } from './queries/postgres-get-count.query.js';
import {
    convertKeysToCamelCase,
    convertKeysToSnakeCase,
    toPostgresStoreName,
} from './utils/convert-keys.util.js';
import { convertNullToUndefined } from './utils/convert-null-to-undefined.util.js';

export class PostgresDatabase implements IDatabase {
    private connection: PostgresConnection;

    /**
     * @param connection — Prefer a `pg` Pool in production; a single Client is supported for tests (e.g. pg-mem).
     * A PoolClient is supported for short-lived paths; {@link close} is a no-op for those.
     */
    constructor(connection: PostgresConnection) {
        this.connection = connection;
    }

    /**
     * Ends the underlying Pool or Client when this instance owns it.
     * No-op for a borrowed PoolClient (has `release`) — callers must `release()` that themselves.
     */
    async close(): Promise<void> {
        const connection = this.connection as PostgresConnection & {
            release?: (err?: Error | boolean) => void;
            end?: () => Promise<void>;
        };

        // PoolClient from pool.connect() — do not end(); the borrower releases it.
        if (typeof connection.release === 'function') {
            return;
        }

        if (typeof connection.end === 'function') {
            await connection.end();
        }
    }

    preProcessEntity<T extends IEntity>(
        entity: Partial<T>,
        modelSpec: TSchema,
    ): Partial<T> {
        return convertKeysToSnakeCase(entity);
    }
    postProcessEntity<T extends IEntity>(entity: T, modelSpec: TSchema): T {
        const withNullsConverted = convertNullToUndefined(entity, modelSpec);
        return convertKeysToCamelCase(withNullsConverted);
    }
    async getAll<T extends IEntity>(
        collection: string,
        filters: Filters,
        operations: Operation[],
    ): Promise<T[]> {
        return getAllQuery(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            operations,
        );
    }
    async get<T extends IEntity>(
        collection: string,
        queryOptions: IQueryOptions,
        operations: Operation[],
        modelSpec: IModelSpec,
    ): Promise<IPagedResult<T>> {
        return getQuery(
            this.connection,
            toPostgresStoreName(collection),
            queryOptions,
            operations,
            modelSpec,
        );
    }
    async getCount(collection: string, filters: Filters): Promise<number> {
        return getCountQuery(
            this.connection,
            toPostgresStoreName(collection),
            filters,
        );
    }
    async create<T extends IEntity>(
        collection: string,
        entity: Partial<T>,
    ): Promise<{ insertedId: AppIdType; entity: T }> {
        return createCommand(
            this.connection,
            toPostgresStoreName(collection),
            entity,
        );
    }
    async createMany<T extends IEntity>(
        collection: string,
        entities: Partial<T>[],
    ): Promise<{ insertedIds: AppIdType[]; entities: T[] }> {
        return createManyCommand(
            this.connection,
            toPostgresStoreName(collection),
            entities,
        );
    }
    async batchUpdate<T extends IEntity>(
        collection: string,
        filters: Filters,
        entities: Partial<T>[],
        operations: Operation[],
    ): Promise<T[]> {
        return batchUpdateCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            entities,
            operations,
        );
    }
    async replaceOne<T extends IEntity>(
        collection: string,
        filters: Filters,
        entity: Partial<T>,
        operations: Operation[],
    ): Promise<T> {
        return replaceOneCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            entity,
            operations,
        );
    }
    async updateOne<T extends IEntity>(
        collection: string,
        filters: Filters,
        entity: Partial<T>,
        operations: Operation[],
    ): Promise<T> {
        return updateOneCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            entity,
            operations,
        );
    }
    async updateMany<T extends IEntity>(
        collection: string,
        filters: Filters,
        entity: Partial<T>,
        operations: Operation[],
    ): Promise<T[]> {
        return updateManyCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            entity,
            operations,
        );
    }
    async deleteOne(
        collection: string,
        filters: Filters,
    ): Promise<DeleteResult> {
        return deleteOneCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
        );
    }
    async deleteMany(
        collection: string,
        filters: Filters,
    ): Promise<DeleteResult> {
        return deleteManyCommand(
            this.connection,
            toPostgresStoreName(collection),
            filters,
        );
    }
    async find<T extends IEntity>(
        collection: string,
        queryObject: IQueryOptions,
    ): Promise<T[]> {
        return findQuery<T>(
            this.connection,
            toPostgresStoreName(collection),
            queryObject,
        );
    }
    async findOne<T extends IEntity>(
        collection: string,
        filters: Filters,
        operations: Operation[] = [],
    ): Promise<T | null> {
        return findOneQuery(
            this.connection,
            toPostgresStoreName(collection),
            filters,
            operations,
        );
    }
}

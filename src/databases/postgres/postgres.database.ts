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
import { batchUpdate as batchUpdateCommand } from './commands/postgres-batch-update.command.js';
import { create as createCommand } from './commands/postgres-create.command.js';
import { createMany as createManyCommand } from './commands/postgres-create-many.command.js';
import { deleteById as deleteByIdCommand } from './commands/postgres-delete-by-id.command.js';
import { deleteMany as deleteManyCommand } from './commands/postgres-delete-many.command.js';
import { fullUpdateById as fullUpdateByIdCommand } from './commands/postgres-full-update-by-id.command.js';
import { partialUpdateById as partialUpdateByIdCommand } from './commands/postgres-partial-update-by-id.command.js';
import { update as updateCommand } from './commands/postgres-update.command.js';
import type { PostgresConnection } from './postgres-connection.js';
import { find as findQuery } from './queries/postgres-find.query.js';
import { findOne as findOneQuery } from './queries/postgres-find-one.query.js';
import { get as getQuery } from './queries/postgres-get.query.js';
import { getAll as getAllQuery } from './queries/postgres-get-all.query.js';
import { getById as getByIdQuery } from './queries/postgres-get-by-id.query.js';
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
        operations: Operation[],
        pluralResourceName: string,
    ): Promise<T[]> {
        return getAllQuery(
            this.connection,
            operations,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async get<T extends IEntity>(
        operations: Operation[],
        queryOptions: IQueryOptions,
        modelSpec: IModelSpec,
        pluralResourceName: string,
    ): Promise<IPagedResult<T>> {
        return getQuery(
            this.connection,
            operations,
            queryOptions,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async getById<T extends IEntity>(
        operations: Operation[],
        queryObject: IQueryOptions,
        id: AppIdType,
        pluralResourceName: string,
    ): Promise<T | null> {
        return getByIdQuery(
            this.connection,
            operations,
            queryObject,
            id,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async getCount(pluralResourceName: string): Promise<number> {
        return getCountQuery(
            this.connection,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async create<T extends IEntity>(
        entity: Partial<T>,
        pluralResourceName: string,
    ): Promise<{ insertedId: AppIdType; entity: T }> {
        return createCommand(
            this.connection,
            toPostgresStoreName(pluralResourceName),
            entity,
        );
    }
    async createMany<T extends IEntity>(
        entities: Partial<T>[],
        pluralResourceName: string,
    ): Promise<{ insertedIds: AppIdType[]; entities: T[] }> {
        return createManyCommand(
            this.connection,
            toPostgresStoreName(pluralResourceName),
            entities,
        );
    }
    async batchUpdate<T extends IEntity>(
        entities: Partial<T>[],
        operations: Operation[],
        queryObject: IQueryOptions,
        pluralResourceName: string,
    ): Promise<T[]> {
        return batchUpdateCommand(
            this.connection,
            entities,
            operations,
            queryObject,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async fullUpdateById<T extends IEntity>(
        operations: Operation[],
        id: AppIdType,
        entity: Partial<T>,
        pluralResourceName: string,
    ): Promise<T> {
        return fullUpdateByIdCommand(
            this.connection,
            operations,
            id,
            entity,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async partialUpdateById<T extends IEntity>(
        operations: Operation[],
        id: AppIdType,
        entity: Partial<T>,
        pluralResourceName: string,
    ): Promise<T> {
        return partialUpdateByIdCommand(
            this.connection,
            operations,
            id,
            entity,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async update<T extends IEntity>(
        queryObject: IQueryOptions,
        entity: Partial<T>,
        operations: Operation[],
        pluralResourceName: string,
    ): Promise<T[]> {
        return updateCommand(
            this.connection,
            queryObject,
            entity,
            operations,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async deleteById(
        id: AppIdType,
        pluralResourceName: string,
    ): Promise<DeleteResult> {
        return deleteByIdCommand(
            this.connection,
            id,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async deleteMany(
        queryObject: IQueryOptions,
        pluralResourceName: string,
    ): Promise<DeleteResult> {
        return deleteManyCommand(
            this.connection,
            queryObject,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async find<T extends IEntity>(
        queryObject: IQueryOptions,
        pluralResourceName: string,
    ): Promise<T[]> {
        return findQuery<T>(
            this.connection,
            queryObject,
            toPostgresStoreName(pluralResourceName),
        );
    }
    async findOne<T extends IEntity>(
        queryObject: IQueryOptions,
        pluralResourceName: string,
    ): Promise<T | null> {
        return findOneQuery(
            this.connection,
            queryObject,
            toPostgresStoreName(pluralResourceName),
        );
    }
}

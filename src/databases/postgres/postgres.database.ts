import { IQueryOptions, IModelSpec, IPagedResult, IEntity, IUserContextAuthorization } from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import { TSchema } from "@sinclair/typebox";
import { DeleteResult, IDatabase } from "../models/index.js";
import { Operation } from "../operations/operation.js";
import { Client } from 'pg';
import { create as createCommand } from "./commands/postgres-create.command.js";
import { createMany as createManyCommand } from "./commands/postgres-create-many.command.js";
import { batchUpdate as batchUpdateCommand } from "./commands/postgres-batch-update.command.js";
import { fullUpdateById as fullUpdateByIdCommand } from "./commands/postgres-full-update-by-id.command.js";
import { partialUpdateById as partialUpdateByIdCommand } from "./commands/postgres-partial-update-by-id.command.js";
import { update as updateCommand } from "./commands/postgres-update.command.js";
import { deleteById as deleteByIdCommand } from "./commands/postgres-delete-by-id.command.js";
import { deleteMany as deleteManyCommand } from "./commands/postgres-delete-many.command.js";
import { findOne as findOneQuery } from "./queries/postgres-find-one.query.js";
import { find as findQuery } from "./queries/postgres-find.query.js";
import { getAll as getAllQuery } from "./queries/postgres-get-all.query.js";
import { get as getQuery } from "./queries/postgres-get.query.js";
import { getById as getByIdQuery } from "./queries/postgres-get-by-id.query.js";
import { getCount as getCountQuery } from "./queries/postgres-get-count.query.js";
import { convertNullToUndefined } from "./utils/convert-null-to-undefined.util.js";
import { convertKeysToSnakeCase, convertKeysToCamelCase } from "./utils/convert-keys.util.js";

export class PostgresDatabase implements IDatabase {
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }
    preProcessEntity<T extends IEntity>(entity: Partial<T>, modelSpec: TSchema): Partial<T> {
        return convertKeysToSnakeCase(entity);
    }
    postProcessEntity<T extends IEntity>(entity: T, modelSpec: TSchema): T {
        const withNullsConverted = convertNullToUndefined(entity, modelSpec);
        return convertKeysToCamelCase(withNullsConverted);
    }
    async getAll<T extends IEntity>(operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return getAllQuery(this.client, operations, pluralResourceName);
    }
    async get<T extends IEntity>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec, pluralResourceName: string): Promise<IPagedResult<T>> {
        return getQuery(this.client, operations, queryOptions, pluralResourceName);
    }
    async getById<T extends IEntity>(operations: Operation[], queryObject: IQueryOptions, id: AppIdType, pluralResourceName: string): Promise<T | null> {
        return getByIdQuery(this.client, operations, queryObject, id, pluralResourceName);
    }
    async getCount(pluralResourceName: string): Promise<number> {
        return getCountQuery(this.client, pluralResourceName);
    }
    async create<T extends IEntity>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: AppIdType; entity: T; }> {
        return createCommand(this.client, pluralResourceName, entity);
    }
    async createMany<T extends IEntity>(entities: Partial<T>[], pluralResourceName: string): Promise<{ insertedIds: AppIdType[]; entities: T[]; }> {
        return createManyCommand(this.client, pluralResourceName, entities);
    }
    async batchUpdate<T extends IEntity>(entities: Partial<T>[], operations: Operation[], queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return batchUpdateCommand(this.client, entities, operations, queryObject, pluralResourceName);
    }
    async fullUpdateById<T extends IEntity>(operations: Operation[], id: AppIdType, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        return fullUpdateByIdCommand(this.client, operations, id, entity, pluralResourceName);
    }
    async partialUpdateById<T extends IEntity>(operations: Operation[], id: AppIdType, entity: Partial<T>, pluralResourceName: string): Promise<T> {
        return partialUpdateByIdCommand(this.client, operations, id, entity, pluralResourceName);
    }
    async update<T extends IEntity>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[], pluralResourceName: string): Promise<T[]> {
        return updateCommand(this.client, queryObject, entity, operations, pluralResourceName);
    }
    async deleteById(id: AppIdType, pluralResourceName: string): Promise<DeleteResult> {
        return deleteByIdCommand(this.client, id, pluralResourceName);
    }
    async deleteMany(queryObject: IQueryOptions, pluralResourceName: string): Promise<DeleteResult> {
        return deleteManyCommand(this.client, queryObject, pluralResourceName);
    }
    async find<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T[]> {
        return findQuery<T>(this.client, queryObject, pluralResourceName);
    }
    async findOne<T extends IEntity>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null> {
        return findOneQuery(this.client, queryObject, pluralResourceName);
    }

    /**
     * Fetches current authorizations for one or more users.
     * Returns a map of userId -> IAuthorization[] where authorizations are current
     * (after startDate and before endDate if present).
     */
    async getUserAuthorizations(userId: AppIdType, orgId?: AppIdType): Promise<IUserContextAuthorization[]> {
        const now = new Date();
        let query = `
            SELECT DISTINCT
                ur."user_id" as "userId",
                r."name" as "role",
                f."name" as "feature",
                a."config",
                a."_id",
                a."_orgId"
            FROM "user_roles" ur
            INNER JOIN "roles" r ON ur."role_id" = r."_id"
            INNER JOIN "authorizations" a ON r."_id" = a."role_id"
            INNER JOIN "features" f ON a."feature_id" = f."_id"
            WHERE ur."user_id" = $1
                AND ur."_deleted" IS NULL
                AND a."_deleted" IS NULL
                AND (a."start_date" IS NULL OR a."start_date" <= $2)
                AND (a."end_date" IS NULL OR a."end_date" >= $2)
        `;

        const values: any[] = [userId, now];

        if (orgId) {
            query += ` AND ur."_orgId" = $3 AND r."_orgId" = $3 AND a."_orgId" = $3 AND f."_orgId" = $3`;
            values.push(orgId);
        }

        const result = await this.client.query(query, values);

        const authorizations: IUserContextAuthorization[] = [];

        for (const row of result.rows) {
            const userId = row.userId;
            authorizations.push({
                _id: row._id,
                _orgId: row._orgId,
                role: row.role,
                feature: row.feature,
                config: row.config || undefined,
            });
        }
        return authorizations;
    }
}
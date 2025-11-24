import { IQueryOptions, IModelSpec, IPagedResult } from "@loomcore/common/models";
import { TSchema } from "@sinclair/typebox";
import { DeleteResult, IDatabase } from "../models/index.js";
import { Operation } from "../operations/operation.js";
import { Client } from 'pg';
import { BadRequestError, DuplicateKeyError } from "../../errors/index.js";
import { randomUUID } from 'crypto';

export class PostgresDatabase implements IDatabase {
    private client: Client;

    constructor(client: Client, pluralResourceName: string) {
        this.client = client;
    }
    preprocessEntity<T>(entity: T, modelSpec: TSchema): T {
        return entity;
    }
    postprocessEntity<T>(entity: T, modelSpec: TSchema): T {
        return entity;
    }
    async getAll<T>(operations: Operation[]): Promise<T[]> {
        throw new Error("Method not implemented.");
    }
    get<T>(operations: Operation[], queryOptions: IQueryOptions, modelSpec: IModelSpec): Promise<IPagedResult<T>> {
        throw new Error("Method not implemented.");
    }
    getById<T>(operations: Operation[], id: string): Promise<T | null> {
        throw new Error("Method not implemented.");
    }
    getCount(operations: Operation[]): Promise<number> {
        throw new Error("Method not implemented.");
    }
    async create<T>(entity: Partial<T>, pluralResourceName: string): Promise<{ insertedId: string; entity: T; }> {
        try {
            const guid = randomUUID();
            const entityAny = entity as any;
            entityAny._id = guid;

            const columns: string[] = ['_id'];
            const values: any[] = [guid];
            
            for (const [key, value] of Object.entries(entityAny)) {
                if (key !== '_id' && value !== undefined) {
                    columns.push(`"${key}"`);
                    values.push(value);
                }
            }
            
            // Build parameterized query
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const query = `
                INSERT INTO "${pluralResourceName}" (${columns.join(', ')})
                VALUES (${placeholders})
                RETURNING _id
            `;

            const result = await this.client.query(query, values);
                        if (result.rows.length === 0) {
                throw new BadRequestError(`Error creating ${pluralResourceName}: No row returned`);
            }
            
            const insertedId = result.rows[0]._id;
            
            const createdEntity = {
                ...entity,
                _id: insertedId
            } as T;
            
            return {
                insertedId: insertedId,
                entity: createdEntity
            };
        }
        catch (err: any) {
            // PostgreSQL error code 23505 is for unique constraint violations
            if (err.code === '23505') {
                throw new DuplicateKeyError(`${pluralResourceName} already exists`);
            }
            throw new BadRequestError(`Error creating ${pluralResourceName}: ${err.message}`);
        }
    }
    createMany<T>(entities: Partial<T>[]): Promise<{ insertedIds: string[]; entities: T[]; }> {
        throw new Error("Method not implemented.");
    }
    batchUpdate<T>(entities: Partial<T>[], operations: Operation[]): Promise<T[]> {
        throw new Error("Method not implemented.");
    }
    fullUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>): Promise<T> {
        throw new Error("Method not implemented.");
    }
    partialUpdateById<T>(operations: Operation[], id: string, entity: Partial<T>): Promise<T> {
        throw new Error("Method not implemented.");
    }
    update<T>(queryObject: IQueryOptions, entity: Partial<T>, operations: Operation[]): Promise<T[]> {
        throw new Error("Method not implemented.");
    }
    deleteById(id: string): Promise<DeleteResult> {
        throw new Error("Method not implemented.");
    }
    deleteMany(queryObject: IQueryOptions): Promise<DeleteResult> {
        throw new Error("Method not implemented.");
    }
    find<T>(queryObject: IQueryOptions): Promise<T[]> {
        throw new Error("Method not implemented.");
    }
    async findOne<T>(queryObject: IQueryOptions, pluralResourceName: string): Promise<T | null> {
        const filters = queryObject.filters || {};

        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Build WHERE clause from filters
        for (const [key, value] of Object.entries(filters)) {
            if (value) {
                // Convert _id to id for Postgres column name
                const columnName = key === '_id' ? 'id' : key;
                
                if (value.eq !== undefined) {
                    conditions.push(`"${columnName}" = $${paramIndex}`);
                    values.push(value.eq);
                    paramIndex++;
                } else if (value.in !== undefined && Array.isArray(value.in)) {
                    const placeholders = value.in.map(() => `$${paramIndex++}`).join(', ');
                    conditions.push(`"${columnName}" IN (${placeholders})`);
                    values.push(...value.in);
                } else if (value.gte !== undefined) {
                    conditions.push(`"${columnName}" >= $${paramIndex}`);
                    values.push(value.gte);
                    paramIndex++;
                } else if (value.lte !== undefined) {
                    conditions.push(`"${columnName}" <= $${paramIndex}`);
                    values.push(value.lte);
                    paramIndex++;
                } else if (value.gt !== undefined) {
                    conditions.push(`"${columnName}" > $${paramIndex}`);
                    values.push(value.gt);
                    paramIndex++;
                } else if (value.lt !== undefined) {
                    conditions.push(`"${columnName}" < $${paramIndex}`);
                    values.push(value.lt);
                    paramIndex++;
                } else if (value.contains !== undefined) {
                    conditions.push(`LOWER("${columnName}") LIKE LOWER($${paramIndex})`);
                    values.push(`%${value.contains}%`);
                    paramIndex++;
                }
            }
        }

        // Build ORDER BY clause if sort options are provided
        let orderByClause = '';
        if (queryObject.orderBy) {
            const columnName = queryObject.orderBy === '_id' ? 'id' : queryObject.orderBy;
            const sortDir = queryObject.sortDirection;
            const direction = (typeof sortDir === 'string' && sortDir.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
            orderByClause = ` ORDER BY ${columnName} ${direction}`;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const query = `SELECT * FROM "${pluralResourceName}" ${whereClause}${orderByClause} LIMIT 1`;
        const result = await this.client.query(query, values);

        if (result.rows.length === 0) {
            return null;
        }

        const row = result.rows[0];
        // Convert id back to _id in the result
        const entityAny: any = { ...row };
        if (row._id !== undefined) {
            entityAny._id = row._id;
            delete entityAny._id;
        }

        return entityAny as T;
    }

}
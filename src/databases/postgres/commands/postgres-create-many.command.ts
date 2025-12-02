import { Client } from 'pg';
import { BadRequestError, DuplicateKeyError } from "../../../errors/index.js";
import { randomUUID } from 'crypto';
import { IEntity } from '@loomcore/common/models';

export async function createMany<T extends IEntity>(
    client: Client,
    pluralResourceName: string,
    entities: Partial<T>[]
): Promise<{ insertedIds: string[]; entities: T[] }> {
    if (entities.length === 0) {
        return {
            insertedIds: [],
            entities: []
        };
    }

    try {
        const entitiesWithIds = entities.map(entity => {
            entity._id = entity._id ?? randomUUID().toString();
            return entity;
        });
        
        // Resolve every column that belongs to the table so we can overwrite each field.
        const tableColumns = await client.query<{
            column_name: string;
            column_default: string;
        }>(
            `
                SELECT column_name, column_default
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = $1
                ORDER BY ordinal_position
            `,
            [pluralResourceName]
        );

        if (tableColumns.rows.length === 0) {
            throw new BadRequestError(`Unable to resolve columns for ${pluralResourceName}`);
        }

        // Build parameterized query with multiple VALUES clauses
        const allValues: any[] = [];
        const valueClauses: string[] = [];
        
        entitiesWithIds.forEach((entity, entityIndex) => {
            const objectEntries = Object.entries(entity);
            const values = tableColumns.rows.map(column => {
                if (objectEntries.find(entry => entry[0] === column.column_name)) {
                    return objectEntries.find(entry => entry[0] === column.column_name)?.[1];
                }
                return column.column_default;
            });
            const placeholders = values.map((_, valueIndex) => {
                const paramIndex = entityIndex * values.length + valueIndex + 1;
                return `$${paramIndex}`;
            }).join(', ');
            
            valueClauses.push(`(${placeholders})`);
            allValues.push(...values);
        });

        const query = `
            INSERT INTO "${pluralResourceName}" (${tableColumns.rows.map(column => `"${column.column_name}"`).join(', ')})
            VALUES ${valueClauses.join(', ')}
            RETURNING _id
        `;

        const result = await client.query(query, allValues);
        
        if (result.rows.length !== entitiesWithIds.length) {
            throw new BadRequestError(`Error creating ${pluralResourceName}: Expected ${entitiesWithIds.length} rows, got ${result.rows.length}`);
        }
        
        const insertedIds = result.rows.map(row => row._id);
        
        return {
            insertedIds,
            entities: entitiesWithIds as T[]
        };
    }
    catch (err: any) {
        // PostgreSQL error code 23505 is for unique constraint violations
        if (err.code === '23505') {
            throw new DuplicateKeyError(`One or more ${pluralResourceName} already exist`);
        }
        throw new BadRequestError(`Error creating ${pluralResourceName}: ${err.message}`);
    }
}


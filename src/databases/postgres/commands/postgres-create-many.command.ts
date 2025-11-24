import { Client } from 'pg';
import { BadRequestError, DuplicateKeyError } from "../../../errors/index.js";
import { randomUUID } from 'crypto';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
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
        // Generate UUIDs for all entities
        const entitiesWithIds = entities.map(entity => {
            (entity as any)._id = randomUUID().toString();
            return entity;
        });

        // Get columns from the first entity (assuming all entities have the same structure)
        const { columns } = columnsAndValuesFromEntity(entitiesWithIds[0]);
        
        // Build parameterized query with multiple VALUES clauses
        const allValues: any[] = [];
        const valueClauses: string[] = [];
        
        entitiesWithIds.forEach((entity, entityIndex) => {
            const { values } = columnsAndValuesFromEntity(entity);
            const placeholders = values.map((_, valueIndex) => {
                const paramIndex = entityIndex * values.length + valueIndex + 1;
                return `$${paramIndex}`;
            }).join(', ');
            
            valueClauses.push(`(${placeholders})`);
            allValues.push(...values);
        });

        const query = `
            INSERT INTO "${pluralResourceName}" (${columns.join(', ')})
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


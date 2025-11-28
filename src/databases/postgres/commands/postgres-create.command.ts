import { Client } from 'pg';
import { IEntity } from "@loomcore/common/models";
import { BadRequestError, DuplicateKeyError } from "../../../errors/index.js";
import { randomUUID } from 'crypto';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';

export async function create<T extends IEntity>(
    client: Client,
    pluralResourceName: string,
    entity: Partial<T>
): Promise<{ insertedId: string; entity: T }> {
    try {
        entity._id = entity._id ?? randomUUID().toString();
        const { columns, values } = columnsAndValuesFromEntity(entity);
        
        // Build parameterized query
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
        const query = `
            INSERT INTO "${pluralResourceName}" (${columns.join(', ')})
            VALUES (${placeholders})
            RETURNING _id
        `;

        const result = await client.query(query, values);
        if (result.rows.length === 0) {
            throw new BadRequestError(`Error creating ${pluralResourceName}: No row returned`);
        }
        
        return {
            insertedId: entity._id,
            entity: entity as T
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


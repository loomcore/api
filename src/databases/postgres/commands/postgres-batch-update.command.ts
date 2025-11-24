import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { BadRequestError } from "../../../errors/index.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { IEntity } from '@loomcore/common/models';

export async function batchUpdate<T extends IEntity>(
    client: Client,
    entities: Partial<T>[],
    operations: Operation[],
    pluralResourceName: string
): Promise<T[]> {
    if (!entities || entities.length === 0) {
        return [];
    }

    const entityIds: string[] = [];

    // Validate all entities have _id
    for (const entity of entities) {
        if (!entity._id || typeof entity._id !== 'string') {
            throw new BadRequestError('Each entity in a batch update must have a valid _id.');
        }
        entityIds.push(entity._id);
    }

    try {
        // Start a transaction
        await client.query('BEGIN');

        // Update each entity
        for (const entity of entities) {
            const { _id, ...updateData } = entity;

            // Skip if there's nothing to update (only _id present)
            if (Object.keys(updateData).length === 0) {
                continue;
            }

            const { columns, values } = columnsAndValuesFromEntity(updateData);
            
            // Build SET clause for UPDATE
            const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');
            
            // Add _id as the last parameter for WHERE clause
            const query = `
                UPDATE "${pluralResourceName}"
                SET ${setClause}
                WHERE "_id" = $${values.length + 1}
            `;

            await client.query(query, [...values, _id]);
        }

        // Commit the transaction
        await client.query('COMMIT');

        // Retrieve updated entities with operations applied
        const joinClauses = buildJoinClauses(operations);
        
        // Build WHERE clause for retrieving updated entities
        const placeholders = entityIds.map((_, index) => `$${index + 1}`).join(', ');
        const selectQuery = `
            SELECT * FROM "${pluralResourceName}" ${joinClauses}
            WHERE "_id" IN (${placeholders})
        `;

        const result = await client.query(selectQuery, entityIds);
        
        return result.rows as T[];
    }
    catch (err: any) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        
        // PostgreSQL error code 23505 is for unique constraint violations
        if (err.code === '23505') {
            throw new BadRequestError(`One or more ${pluralResourceName} have duplicate key violations`);
        }
        throw new BadRequestError(`Error updating ${pluralResourceName}: ${err.message}`);
    }
}


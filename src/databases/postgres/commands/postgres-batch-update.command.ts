import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
import { BadRequestError } from "../../../errors/index.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { transformJoinResults } from '../utils/transform-join-results.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { Filter, IEntity, IQueryOptions } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { buildWhereClause } from '../utils/build-where-clause.js';

export async function batchUpdate<T extends IEntity>(
    client: Client,
    entities: Partial<T>[],
    operations: Operation[],
    queryObject: IQueryOptions,
    pluralResourceName: string
): Promise<T[]> {
    if (!entities || entities.length === 0) {
        return [];
    }

    const entityIds: AppIdType[] = [];

    // Validate all entities have _id (can be string or number depending on database)
    for (const entity of entities) {
        if (!entity._id || (typeof entity._id !== 'string' && typeof entity._id !== 'number')) {
            throw new BadRequestError('Each entity in a batch update must have a valid _id.');
        }
        entityIds.push(entity._id);
    }
    queryObject.filters = queryObject.filters || {};

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
            
            const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

            queryObject.filters._id = { eq: _id };
            const { whereClause } = buildWhereClause(queryObject, values);

            const query = `
                UPDATE "${pluralResourceName}"
                SET ${setClause}
                ${whereClause}
            `;

            await client.query(query, values);
        }

        await client.query('COMMIT');

        const joinClauses = buildJoinClauses(operations, pluralResourceName);
        
        // When there are joins, qualify column names with table prefix to avoid ambiguity
        const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
        const tablePrefix = hasJoins ? pluralResourceName : undefined;
        
        queryObject.filters._id = { in: entityIds as any };
        
        const { whereClause, values } = buildWhereClause(queryObject, [], tablePrefix);
        
        // Build SELECT clause with explicit columns and JSON aggregation for joins
        // If no joins, use SELECT * for simplicity
        const selectClause = hasJoins 
            ? await buildSelectClause(client, pluralResourceName, pluralResourceName, operations)
            : '*';
        
        const selectQuery = `
            SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}
            ${whereClause}
        `;

        const result = await client.query(selectQuery, values);
        
        // Transform flat results into nested objects if joins are present
        return hasJoins 
            ? transformJoinResults<T>(result.rows, operations)
            : result.rows as T[];
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


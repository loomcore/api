import { Client } from 'pg';
import { IQueryOptions } from "@loomcore/common/models";
import { Operation } from "../../operations/operation.js";
import { BadRequestError, NotFoundError } from "../../../errors/index.js";
import { buildWhereClause } from '../utils/build-where-clause.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildOrderByClause } from '../utils/build-order-by-clause.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { IEntity } from '@loomcore/common/models';

export async function update<T extends IEntity>(
    client: Client,
    queryObject: IQueryOptions,
    entity: Partial<T>,
    operations: Operation[],
    pluralResourceName: string
): Promise<T[]> {
    try {
        // Build WHERE clause from queryObject
        const { whereClause, values: whereValues } = buildWhereClause(queryObject);
        
        if (!whereClause) {
            throw new BadRequestError('Update query must include filters to prevent updating all records');
        }

        // Extract columns and values from the entity (only the fields to update)
        const { columns, values: entityValues } = columnsAndValuesFromEntity(entity);
        
        // Filter out _id from columns for the SET clause
        const updateColumns = columns.filter(col => col !== '"_id"');
        const updateValues = entityValues.filter((_, index) => columns[index] !== '"_id"');
        
        if (updateColumns.length === 0) {
            throw new BadRequestError('Cannot perform update with no fields to update');
        }
        
        // Build SET clause for UPDATE
        const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');
        
        // Combine values: first the SET values, then the WHERE values
        // Need to adjust parameter indices in WHERE clause
        const whereClauseWithAdjustedParams = whereClause.replace(/\$(\d+)/g, (match, num) => {
            const originalIndex = parseInt(num, 10);
            return `$${originalIndex + updateValues.length}`;
        });
        
        const updateQuery = `
            UPDATE "${pluralResourceName}"
            SET ${setClause}
            ${whereClauseWithAdjustedParams}
        `;

        const allUpdateValues = [...updateValues, ...whereValues];
        const result = await client.query(updateQuery, allUpdateValues);
        
        if (result.rowCount === 0) {
            throw new NotFoundError('No records found matching update query');
        }

        // Retrieve updated entities with operations applied
        const joinClauses = buildJoinClauses(operations);
        const orderByClause = buildOrderByClause(queryObject);
        
        // Build SELECT query to retrieve updated entities
        // Use the same WHERE clause and operations as the update query
        const selectQuery = `
            SELECT * FROM "${pluralResourceName}" ${joinClauses}
            ${whereClause} ${orderByClause}
        `.trim();

        const selectResult = await client.query(selectQuery, whereValues);
        
        return selectResult.rows as T[];
    }
    catch (err: any) {
        // Re-throw NotFoundError as-is
        if (err instanceof NotFoundError) {
            throw err;
        }
        
        // PostgreSQL error code 23505 is for unique constraint violations
        if (err.code === '23505') {
            throw new BadRequestError(`${pluralResourceName} has duplicate key violations`);
        }
        throw new BadRequestError(`Error updating ${pluralResourceName}: ${err.message}`);
    }
}


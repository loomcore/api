import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { BadRequestError, IdNotFoundError } from "../../../errors/index.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { IEntity } from '@loomcore/common/models';

export async function fullUpdateById<T extends IEntity>(
    client: Client,
    operations: Operation[],
    id: string,
    entity: Partial<T>,
    pluralResourceName: string
): Promise<T> {
    try {
        // Get all columns and their default values from the table schema
        const tableColumns = await client.query<{
            column_name: string;
            column_default: string | null;
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

        // System columns that should be preserved (not updated)
        const preservedColumns = new Set(['_id', '_created', '_createdBy']);
        
        const entityRecord = entity as Record<string, any>;
        const updateColumns: string[] = [];
        const updateValues: any[] = [];
        let paramIndex = 1;
        
        // Build SET clause for all columns
        for (const column of tableColumns.rows) {
            const columnName = column.column_name;
            
            // Skip preserved system columns
            if (preservedColumns.has(columnName)) {
                continue;
            }
            
            // If entity has a value for this column, use it
            if (columnName in entityRecord && entityRecord[columnName] !== undefined) {
                updateColumns.push(`"${columnName}" = $${paramIndex}`);
                updateValues.push(entityRecord[columnName]);
                paramIndex++;
            } else if (column.column_default !== null) {
                // Use DEFAULT keyword for columns with default values
                updateColumns.push(`"${columnName}" = DEFAULT`);
            } else {
                // Set to NULL for columns without defaults
                updateColumns.push(`"${columnName}" = $${paramIndex}`);
                updateValues.push(null);
                paramIndex++;
            }
        }
        
        if (updateColumns.length === 0) {
            throw new BadRequestError('Cannot perform full update with no fields to update');
        }
        
        // Build SET clause
        const setClause = updateColumns.join(', ');
        
        // Add id as the last parameter for WHERE clause
        const query = `
            UPDATE "${pluralResourceName}"
            SET ${setClause}
            WHERE "_id" = $${paramIndex}
        `;
        
        const result = await client.query(query, [...updateValues, id]);
        
        if (result.rowCount === 0) {
            throw new IdNotFoundError();
        }

        // Retrieve updated entity with operations applied
        const joinClauses = buildJoinClauses(operations);
        const selectQuery = `
            SELECT * FROM "${pluralResourceName}" ${joinClauses}
            WHERE "_id" = $1 LIMIT 1
        `;

        const selectResult = await client.query<T>(selectQuery, [id]);
        
        if (selectResult.rows.length === 0) {
            throw new IdNotFoundError();
        }
        
        return selectResult.rows[0];
    }
    catch (err: any) {
        // Re-throw IdNotFoundError as-is
        if (err instanceof IdNotFoundError) {
            throw err;
        }
        
        // PostgreSQL error code 23505 is for unique constraint violations
        if (err.code === '23505') {
            throw new BadRequestError(`${pluralResourceName} has duplicate key violations`);
        }
        throw new BadRequestError(`Error updating ${pluralResourceName}: ${err.message}`);
    }
}


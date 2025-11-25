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
        // Resolve every column that belongs to the table so we can overwrite each field.
        const columnResult = await client.query<{
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

        if (columnResult.rows.length === 0) {
            throw new BadRequestError(`Unable to resolve columns for ${pluralResourceName}`);
        }

        const entityRecord = (entity ?? {}) as Record<string, any>;

        const updateColumns = columnResult.rows
            .filter(column => column.column_name !== '_id');

        if (updateColumns.length === 0) {
            throw new BadRequestError(`No updatable columns found for ${pluralResourceName}`);
        }

        const updateValues = updateColumns.map(column => {
            const columnName = column.column_name;
            if (Object.prototype.hasOwnProperty.call(entityRecord, columnName)) {
                return entityRecord[columnName];
            }

            // Column not present in the entity payload, so use the default value.
            return column.column_default;
        });

        // Build SET clause for UPDATE
        const setClause = updateColumns
            .map((column, index) => `"${column.column_name}" = $${index + 1}`)
            .join(', ');
        
        // Add id as the last parameter for WHERE clause
        const query = `
            UPDATE "${pluralResourceName}"
            SET ${setClause}
            WHERE "_id" = $${updateValues.length + 1}
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


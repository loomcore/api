import { Client } from 'pg';
import { Operation } from "../../operations/operation.js";
import { BadRequestError, IdNotFoundError } from "../../../errors/index.js";
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';

export async function partialUpdateById<T extends IEntity>(
    client: Client,
    operations: Operation[],
    id: AppIdType,
    entity: Partial<T>,
    pluralResourceName: string
): Promise<T> {
    try {

        console.log('entity', JSON.stringify(entity, null, 2));
        // Extract columns and values from the entity (only the fields to update)
        const { columns, values } = columnsAndValuesFromEntity(entity);


        console.log('columns', JSON.stringify(columns, null, 2));
        console.log('values', JSON.stringify(values, null, 2));
        // Filter out _id from columns for the SET clause (we use it in WHERE)
        const updateColumns = columns.filter(col => col !== '"_id"');
        const updateValues = values.filter((_, index) => columns[index] !== '"_id"');

        if (updateColumns.length === 0) {
            throw new BadRequestError('Cannot perform partial update with no fields to update');
        }

        // Build SET clause for UPDATE
        const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');

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

        const selectResult = await client.query(selectQuery, [id]);

        if (selectResult.rows.length === 0) {
            throw new IdNotFoundError();
        }

        return selectResult.rows[0] as T;
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


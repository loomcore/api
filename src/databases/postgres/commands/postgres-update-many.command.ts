import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, NotFoundError } from '../../../errors/index.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';
import { IEntity } from '@loomcore/common/models';
import type { Filters } from '../../../services/filters.type.js';

export async function updateMany<T extends IEntity>(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
  entity: Partial<T>,
  operations: Operation[],
): Promise<T[]> {
  try {
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

    const { whereClause, values: allUpdateValues } = buildWhereClause(
      { filters },
      pluralResourceName,
      [...updateValues],
    );

    const updateQuery = `
      UPDATE "${pluralResourceName}"
      SET ${setClause}
      ${whereClause}
    `;

    const result = await client.query(updateQuery, allUpdateValues);

    if (result.rowCount === 0) {
      throw new NotFoundError('No records found matching update query');
    }

    // Retrieve updated entities with operations applied
    const hasJoins = operations.some(isJoinOperation);
    const joinClauses = buildJoinClauses(operations, pluralResourceName);
    const { whereClause: selectWhereClause, values: selectWhereValues } = buildWhereClause(
      { filters },
      pluralResourceName,
      [],
      operations,
    );

    const selectClause = hasJoins
      ? await buildSelectClause(client, pluralResourceName, operations)
      : '*';

    const selectQuery = `
      SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}
      ${selectWhereClause}
    `.trim();

    const selectResult = await client.query(selectQuery, selectWhereValues);

    return hasJoins
      ? (selectResult.rows as { entity: T }[]).map(r => r.entity)
      : (selectResult.rows as T[]);
  } catch (err: any) {
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

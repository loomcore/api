import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { BadRequestError, IdNotFoundError } from '../../../errors/index.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';
import { IEntity } from '@loomcore/common/models';
import type { Filters } from '../../../services/filters.type.js';

export async function updateOne<T extends IEntity>(
  client: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
  entity: Partial<T>,
  operations: Operation[],
): Promise<T> {
  try {
    // Extract columns and values from the entity (only the fields to update)
    const { columns, values } = columnsAndValuesFromEntity(entity);

    // Filter out _id from columns for the SET clause (we use it in WHERE)
    const updateColumns = columns.filter(col => col !== '"_id"');
    const updateValues = values.filter((_, index) => columns[index] !== '"_id"');

    if (updateColumns.length === 0) {
      throw new BadRequestError('Cannot perform partial update with no fields to update');
    }

    // Build SET clause for UPDATE
    const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');

    const { whereClause, values: queryValues } = buildWhereClause(
      { filters },
      pluralResourceName,
      [...updateValues],
    );

    const query = `
      UPDATE "${pluralResourceName}"
      SET ${setClause}
      ${whereClause}
    `;

    const result = await client.query(query, queryValues);

    if (result.rowCount === 0) {
      throw new IdNotFoundError();
    }

    // Retrieve updated entity with operations applied
    const hasJoins = operations.some(isJoinOperation);
    const joinClauses = buildJoinClauses(operations, pluralResourceName);

    const selectClause = hasJoins
      ? await buildSelectClause(client, pluralResourceName, operations)
      : '*';

    const { whereClause: selectWhereClause, values: selectValues } = buildWhereClause(
      { filters },
      pluralResourceName,
      [],
      operations,
    );

    const selectQuery = `
      SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}
      ${selectWhereClause} LIMIT 1
    `;

    const selectResult = await client.query(selectQuery, selectValues);

    if (selectResult.rows.length === 0) {
      throw new IdNotFoundError();
    }

    return hasJoins
      ? (selectResult.rows[0] as { entity: T }).entity
      : (selectResult.rows[0] as T);
  } catch (err: any) {
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

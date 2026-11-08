import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
import { BadRequestError, IdNotFoundError } from '../../../errors/index.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';

export async function partialUpdateById<T extends IEntity>(
  client: PostgresConnection,
  operations: Operation[],
  id: AppIdType,
  entity: Partial<T>,
  pluralResourceName: string,
  orgId?: AppIdType
): Promise<T> {
  try {
    const { columns, values } = columnsAndValuesFromEntity(entity);

    const updateColumns = columns.filter(col => col !== '"_id"');
    const updateValues = values.filter((_, index) => columns[index] !== '"_id"');

    if (updateColumns.length === 0) {
      throw new BadRequestError('Cannot perform partial update with no fields to update');
    }

    const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');

    let whereClause: string;
    let queryValues: unknown[];

    if (orgId !== undefined) {
      whereClause = `WHERE "_id" = $${updateValues.length + 1} AND "_orgId" = $${updateValues.length + 2}`;
      queryValues = [...updateValues, id, orgId];
    } else {
      whereClause = `WHERE "_id" = $${updateValues.length + 1}`;
      queryValues = [...updateValues, id];
    }

    const query = `
      UPDATE "${pluralResourceName}"
      SET ${setClause}
      ${whereClause}
    `;

    const result = await client.query(query, queryValues);

    if (result.rowCount === 0) {
      throw new IdNotFoundError();
    }

    const hasJoins = operations.some(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany);
    const joinClauses = buildJoinClauses(operations, pluralResourceName);

    const selectClause = hasJoins
      ? await buildSelectClause(client, pluralResourceName, operations)
      : '*';

    const idColumn = hasJoins ? `"${pluralResourceName}"."_id"` : '"_id"';

    let selectWhereClause: string;
    let selectValues: unknown[];

    if (orgId !== undefined) {
      const orgIdColumn = hasJoins ? `"${pluralResourceName}"."_orgId"` : '"_orgId"';
      selectWhereClause = `WHERE ${idColumn} = $1 AND ${orgIdColumn} = $2`;
      selectValues = [id, orgId];
    } else {
      selectWhereClause = `WHERE ${idColumn} = $1`;
      selectValues = [id];
    }

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

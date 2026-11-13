import { Pool, type PoolClient, type Client } from 'pg';
import type { PostgresConnection } from '../postgres-connection.js';
import { Operation } from '../../operations/operation.js';
import { BadRequestError } from '../../../errors/index.js';
import { buildJoinClauses } from '../utils/build-join-clauses.js';
import { buildSelectClause } from '../utils/build-select-clause.js';
import { transformJoinResults } from '../utils/transform-join-results.js';
import { columnsAndValuesFromEntity } from '../utils/columns-and-values-from-entity.js';
import { IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { buildWhereClause } from '../utils/build-where-clause.js';
import { isJoinOperation } from '../../utils/is-join-operation.util.js';
import type { Filters } from '../../../services/filters.type.js';

export async function batchUpdate<T extends IEntity>(
  connection: PostgresConnection,
  pluralResourceName: string,
  filters: Filters,
  entities: Partial<T>[],
  operations: Operation[],
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

  let session: PoolClient | Client;
  let releaseSession = false;
  if (connection instanceof Pool) {
    session = await connection.connect();
    releaseSession = true;
  } else {
    session = connection as Client | PoolClient;
  }

  try {
    // Start a transaction
    await session.query('BEGIN');

    // Update each entity
    for (const entity of entities) {
      const { _id, ...updateData } = entity;

      // Skip if there's nothing to update (only _id present)
      if (Object.keys(updateData).length === 0) {
        continue;
      }

      const { columns, values } = columnsAndValuesFromEntity(updateData);

      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

      const entityFilters: Filters = { ...filters, _id: { eq: _id } };
      const { whereClause } = buildWhereClause({ filters: entityFilters }, pluralResourceName, values);

      const query = `
        UPDATE "${pluralResourceName}"
        SET ${setClause}
        ${whereClause}
      `;

      await session.query(query, values);
    }

    await session.query('COMMIT');

    const joinClauses = buildJoinClauses(operations, pluralResourceName);

    const hasJoins = operations.some(isJoinOperation);

    const selectFilters: Filters = { ...filters, _id: { in: entityIds as any } };
    const { whereClause, values } = buildWhereClause({ filters: selectFilters }, pluralResourceName);

    // Build SELECT clause with explicit columns and JSON aggregation for joins
    // If no joins, use SELECT * for simplicity
    const selectClause = hasJoins
      ? await buildSelectClause(session, pluralResourceName, operations)
      : '*';

    const selectQuery = `
      SELECT ${selectClause} FROM "${pluralResourceName}" ${joinClauses}
      ${whereClause}
    `;

    const result = await session.query(selectQuery, values);

    // Transform flat results into nested objects if joins are present
    return hasJoins
      ? transformJoinResults<T>(result.rows, operations)
      : result.rows as T[];
  } catch (err: any) {
    // Rollback transaction on error
    await session.query('ROLLBACK');

    // PostgreSQL error code 23505 is for unique constraint violations
    if (err.code === '23505') {
      throw new BadRequestError(`One or more ${pluralResourceName} have duplicate key violations`);
    }
    throw new BadRequestError(`Error updating ${pluralResourceName}: ${err.message}`);
  } finally {
    if (releaseSession) {
      (session as PoolClient).release();
    }
  }
}

import { IQueryOptions } from '@loomcore/common/models';
import { readFilterValue } from '../../utils/nullish-filter-value.js';
import { toSnakeCase } from './convert-keys.util.js';

export function buildWhereClause(queryObject: IQueryOptions, values: any[] = [], tablePrefix?: string): { whereClause: string, values: any[] } {
  const filters = queryObject.filters || {};
  const conditions: string[] = [];
  let paramIndex = values.length + 1;

  // Qualify column names with table prefix if provided
  const qualifyColumn = (columnName: string): string => {
    return tablePrefix ? `"${tablePrefix}"."${columnName}"` : `"${columnName}"`;
  };

  // Build WHERE clause from filters
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      // Convert key to snake_case to match database columns
      // Special case: 'id' maps to '_id' (unless key already starts with underscore)
      let snakeKey: string;
      if (key.startsWith('_')) {
        // Preserve keys that start with underscore
        snakeKey = key;
      } else if (key === 'id') {
        // Map 'id' to '_id' for the primary key column
        snakeKey = '_id';
      } else {
        // Convert camelCase to snake_case
        snakeKey = toSnakeCase(key);
      }
      const qualifiedKey = qualifyColumn(snakeKey);

      if (value.eq !== undefined) {
        const comparison = readFilterValue(value.eq);
        if (comparison.kind === 'value') {
          // Null-safe equality, equivalent to IS NOT DISTINCT FROM, which pg-mem cannot parse.
          conditions.push(`(${qualifiedKey} = $${paramIndex} OR (${qualifiedKey} IS NULL AND $${paramIndex} IS NULL))`);
          values.push(comparison.value);
          paramIndex++;
        } else {
          // Bare null and undefined are the same in Postgres.
          conditions.push(`${qualifiedKey} IS NULL`);
        }
      }
      if (value.ne !== undefined) {
        const comparison = readFilterValue(value.ne);
        if (comparison.kind === 'value') {
          // Null-safe inequality, equivalent to IS DISTINCT FROM, which pg-mem cannot parse.
          conditions.push(`(${qualifiedKey} != $${paramIndex} OR (${qualifiedKey} IS NOT NULL AND $${paramIndex} IS NULL) OR (${qualifiedKey} IS NULL AND $${paramIndex} IS NOT NULL))`);
          values.push(comparison.value);
          paramIndex++;
        } else {
          conditions.push(`${qualifiedKey} IS NOT NULL`);
        }
      }
      if (value.in !== undefined && Array.isArray(value.in)) {
        const placeholders = value.in.map(() => `$${paramIndex++}`).join(', ');
        conditions.push(`${qualifiedKey} IN (${placeholders})`);
        values.push(...value.in);
      }
      if (value.gte !== undefined) {
        conditions.push(`${qualifiedKey} >= $${paramIndex}`);
        values.push(value.gte);
        paramIndex++;
      }
      if (value.lte !== undefined) {
        conditions.push(`${qualifiedKey} <= $${paramIndex}`);
        values.push(value.lte);
        paramIndex++;
      }
      if (value.gt !== undefined) {
        conditions.push(`${qualifiedKey} > $${paramIndex}`);
        values.push(value.gt);
        paramIndex++;
      }
      if (value.lt !== undefined) {
        conditions.push(`${qualifiedKey} < $${paramIndex}`);
        values.push(value.lt);
        paramIndex++;
      }
      if (value.contains !== undefined) {
        conditions.push(`LOWER(${qualifiedKey}) LIKE LOWER($${paramIndex})`);
        values.push(`%${value.contains}%`);
        paramIndex++;
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}
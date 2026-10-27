import { IQueryOptions } from '@loomcore/common/models';
import type { Operation } from '../../operations/operation.js';
import { partitionFilters } from '../../utils/resolve-join-filter.js';
import { appendFilterConditions, joinFilterSql, toSqlColumnName, type SqlParamIndex } from './build-join-where.js';

export function buildWhereClause(
  queryObject: IQueryOptions,
  values: any[] = [],
  tablePrefix?: string,
  operations?: Operation[],
  mainTableName?: string,
): { whereClause: string; values: any[] } {
  const useJoinFilters = operations !== undefined;
  const resolvedMainTable = mainTableName ?? tablePrefix ?? '';
  const { rootOptions, joinFilters } = useJoinFilters
    ? partitionFilters(queryObject, operations, resolvedMainTable)
    : { rootOptions: queryObject, joinFilters: [] };
  const filters = rootOptions.filters || {};
  const conditions: string[] = [];
  const paramIndex: SqlParamIndex = { current: values.length + 1 };

  // Qualify column names with table prefix if provided
  const qualifyColumn = (columnName: string): string => {
    return tablePrefix ? `"${tablePrefix}"."${columnName}"` : `"${columnName}"`;
  };

  // Build WHERE clause from filters on the root table
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      const qualifiedKey = qualifyColumn(toSqlColumnName(key));
      appendFilterConditions(qualifiedKey, value, conditions, values, paramIndex);
    }
  }

  if (useJoinFilters) {
    for (const joinFilter of joinFilters) {
      const predicate = joinFilterSql(joinFilter, operations, resolvedMainTable, values, paramIndex);
      if (predicate) {
        conditions.push(predicate);
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}

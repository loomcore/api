import { IQueryOptions } from '@loomcore/common/models';
import type { Operation } from '../../operations/operation.js';
import { splitFiltersByType } from '../../utils/resolve-join-filter.js';
import { appendFilterConditions, joinFilterSql, toSqlColumnName, type SqlParamIndex } from './build-join-where.js';

export function buildWhereClause(
  queryObject: IQueryOptions,
  tablePrefix: string,
  values: any[] = [],
  operations?: Operation[],
): { whereClause: string; values: any[] } {
  const useJoinFilters = operations !== undefined && operations.length > 0;
  const { rootOptions, joinFilters } = useJoinFilters
    ? splitFiltersByType(queryObject, operations, tablePrefix)
    : { rootOptions: queryObject, joinFilters: [] };
  const filters = rootOptions.filters || {};
  const conditions: string[] = [];
  const paramIndex: SqlParamIndex = { current: values.length + 1 };

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      const qualifiedKey = `"${tablePrefix}"."${toSqlColumnName(key)}"`;
      appendFilterConditions(qualifiedKey, value, conditions, values, paramIndex);
    }
  }

  if (useJoinFilters) {
    for (const joinFilter of joinFilters) {
      const predicate = joinFilterSql(joinFilter, operations, tablePrefix, values, paramIndex);
      if (predicate) {
        conditions.push(predicate);
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values };
}

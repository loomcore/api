import type { Filter } from '@loomcore/common/models';
import type { Operation } from '../../operations/operation.js';
import {
  findJoinOperation,
  parentAliasOf,
  type JoinFilter,
  type JoinOperation,
} from '../../utils/resolve-join-filter.js';
import { readFilterValue } from '../../utils/nullish-filter-value.js';
import { collectOuterOneToOneAliases } from './build-join-clauses.js';
import { toPostgresStoreName, toSnakeCase } from './convert-keys.util.js';

export interface SqlParamIndex {
  current: number;
}

export function toSqlColumnName(column: string): string {
  if (column.startsWith('_')) {
    return column;
  }
  if (column === 'id') {
    return '_id';
  }
  return toSnakeCase(column);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function appendFilterConditions(
  qualifiedKey: string,
  value: Filter,
  conditions: string[],
  values: any[],
  paramIndex: SqlParamIndex,
): void {
  if (value.eq !== undefined) {
    const comparison = readFilterValue(value.eq);
    if (comparison.kind === 'value') {
      // Null-safe equality, equivalent to IS NOT DISTINCT FROM, which pg-mem cannot parse.
      conditions.push(`(${qualifiedKey} = $${paramIndex.current} OR (${qualifiedKey} IS NULL AND $${paramIndex.current} IS NULL))`);
      values.push(comparison.value);
      paramIndex.current++;
    } else {
      // Bare null and undefined are the same in Postgres.
      conditions.push(`${qualifiedKey} IS NULL`);
    }
  }
  if (value.ne !== undefined) {
    const comparison = readFilterValue(value.ne);
    if (comparison.kind === 'value') {
      // Null-safe inequality, equivalent to IS DISTINCT FROM, which pg-mem cannot parse.
      conditions.push(`(${qualifiedKey} != $${paramIndex.current} OR (${qualifiedKey} IS NOT NULL AND $${paramIndex.current} IS NULL) OR (${qualifiedKey} IS NULL AND $${paramIndex.current} IS NOT NULL))`);
      values.push(comparison.value);
      paramIndex.current++;
    } else {
      conditions.push(`${qualifiedKey} IS NOT NULL`);
    }
  }
  if (value.in !== undefined && Array.isArray(value.in)) {
    const placeholders = value.in.map(() => `$${paramIndex.current++}`).join(', ');
    conditions.push(`${qualifiedKey} IN (${placeholders})`);
    values.push(...value.in);
  }
  if (value.gte !== undefined) {
    conditions.push(`${qualifiedKey} >= $${paramIndex.current}`);
    values.push(value.gte);
    paramIndex.current++;
  }
  if (value.lte !== undefined) {
    conditions.push(`${qualifiedKey} <= $${paramIndex.current}`);
    values.push(value.lte);
    paramIndex.current++;
  }
  if (value.gt !== undefined) {
    conditions.push(`${qualifiedKey} > $${paramIndex.current}`);
    values.push(value.gt);
    paramIndex.current++;
  }
  if (value.lt !== undefined) {
    conditions.push(`${qualifiedKey} < $${paramIndex.current}`);
    values.push(value.lt);
    paramIndex.current++;
  }
  if (value.contains !== undefined) {
    conditions.push(`LOWER(${qualifiedKey}) LIKE LOWER($${paramIndex.current})`);
    values.push(`%${value.contains}%`);
    paramIndex.current++;
  }
}

function qualifyLocalField(localField: string, mainTableName: string): string {
  const dot = localField.indexOf('.');
  if (dot === -1) {
    return mainTableName ? `${quoteIdent(mainTableName)}.${quoteIdent(localField)}` : quoteIdent(localField);
  }
  const alias = localField.slice(0, dot);
  const column = localField.slice(dot + 1);
  return `${quoteIdent(alias)}.${quoteIdent(column)}`;
}

function ancestorChain(
  target: JoinOperation,
  operations: Operation[],
  mainTableName: string,
  outerAliases: Set<string>,
): JoinOperation[] {
  const chain: JoinOperation[] = [target];
  let current: JoinOperation = target;
  const seen = new Set<string>([target.as]);

  while (true) {
    const parentAlias = parentAliasOf(current.localField);
    if (parentAlias === null || parentAlias === mainTableName || outerAliases.has(parentAlias)) {
      break;
    }
    if (seen.has(parentAlias)) {
      break;
    }
    const parent = findJoinOperation(operations, parentAlias);
    if (!parent) {
      break;
    }
    seen.add(parent.as);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

function existsSql(
  target: JoinOperation,
  qualifiedColumn: string,
  filter: Filter,
  operations: Operation[],
  mainTableName: string,
  outerAliases: Set<string>,
  values: any[],
  paramIndex: SqlParamIndex,
): string {
  const chain = ancestorChain(target, operations, mainTableName, outerAliases);
  const first = chain[0];
  let sql = `EXISTS (SELECT 1 FROM ${quoteIdent(toPostgresStoreName(first.from))} AS ${quoteIdent(first.as)}`;

  for (let index = 1; index < chain.length; index++) {
    const child = chain[index];
    const fromTable = quoteIdent(toPostgresStoreName(child.from));
    const childAlias = quoteIdent(child.as);
    const onLeft = qualifyLocalField(child.localField, mainTableName);
    sql += ` INNER JOIN ${fromTable} AS ${childAlias} ON ${onLeft} = ${childAlias}.${quoteIdent(child.foreignField)}`;
  }

  const conditions = [
    `${qualifyLocalField(first.localField, mainTableName)} = ${quoteIdent(first.as)}.${quoteIdent(first.foreignField)}`,
  ];
  appendFilterConditions(qualifiedColumn, filter, conditions, values, paramIndex);
  sql += ` WHERE ${conditions.join(' AND ')})`;
  return sql;
}

/** SQL predicate for one join filter, or null when the target alias is missing. */
export function joinFilterSql(
  joinFilter: JoinFilter,
  operations: Operation[],
  mainTableName: string,
  values: any[],
  paramIndex: SqlParamIndex,
): string | null {
  const target = findJoinOperation(operations, joinFilter.aliases[joinFilter.aliases.length - 1]);
  if (!target) {
    return null;
  }

  const outerAliases = collectOuterOneToOneAliases(operations, mainTableName);
  const qualified = `${quoteIdent(target.as)}.${quoteIdent(toSqlColumnName(joinFilter.column))}`;
  if (!joinFilter.crossesMany && outerAliases.has(target.as)) {
    const conditions: string[] = [];
    appendFilterConditions(qualified, joinFilter.filter, conditions, values, paramIndex);
    if (joinFilter.filter.ne !== undefined) {
      conditions.push(`${quoteIdent(target.as)}."_id" IS NOT NULL`);
    }
    return conditions.join(' AND ');
  }
  return existsSql(target, qualified, joinFilter.filter, operations, mainTableName, outerAliases, values, paramIndex);
}

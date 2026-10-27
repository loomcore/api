import type { Filter, IQueryOptions } from '@loomcore/common/models';
import { BadRequestError } from '../../errors/index.js';
import { InnerJoin } from '../operations/inner-join.operation.js';
import { LeftJoin } from '../operations/left-join.operation.js';
import { LeftJoinMany } from '../operations/left-join-many.operation.js';
import type { Operation } from '../operations/operation.js';

export type JoinOperation = LeftJoin | InnerJoin | LeftJoinMany;

const COLUMN_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isJoinOperation(operation: Operation): operation is JoinOperation {
  return operation instanceof LeftJoin || operation instanceof InnerJoin || operation instanceof LeftJoinMany;
}

export function parentAliasOf(localField: string): string | null {
  const dot = localField.indexOf('.');
  if (dot === -1) {
    return null;
  }
  return localField.slice(0, dot);
}

export function findJoinOperation(operations: Operation[], alias: string): JoinOperation | undefined {
  return operations.find((operation): operation is JoinOperation => isJoinOperation(operation) && operation.as === alias);
}

/** Parent alias from localField. Null means the root collection. */
export function logicalParentAlias(operation: JoinOperation, operations: Operation[], mainTableName: string): string | null {
  const rawParent = parentAliasOf(operation.localField);
  if (rawParent === null || rawParent === mainTableName) {
    return null;
  }
  const parent = findJoinOperation(operations, rawParent);
  return parent ? parent.as : null;
}

export type ClassifiedFilterKey =
  | { type: 'root' }
  | { type: 'invalid'; message: string }
  | { type: 'join'; aliases: string[]; column: string; crossesMany: boolean };

/**
 * A dotted filter key whose first segment is a join alias is a join filter.
 * The path lists every join alias from the root through localField, then the column:
 * `customer.name`, `clientPerson.phoneThrough.phones.phoneNumber`.
 * A dotted key that does not start with a join alias stays a root or embedded filter.
 */
export function classifyFilterKey(key: string, operations: Operation[], mainTableName: string): ClassifiedFilterKey {
  if (!key.includes('.') || operations.length === 0) {
    return { type: 'root' };
  }
  const parts = key.split('.');
  if (parts.some(part => part.length === 0)) {
    return { type: 'root' };
  }
  if (!findJoinOperation(operations, parts[0])) {
    return { type: 'root' };
  }

  const column = parts[parts.length - 1];
  const aliases = parts.slice(0, -1);
  if (!COLUMN_NAME.test(column)) {
    return { type: 'invalid', message: `Invalid join filter "${key}": "${column}" is not a valid column name` };
  }

  for (let index = 0; index < aliases.length; index++) {
    const alias = aliases[index];
    const operation = findJoinOperation(operations, alias);
    if (!operation) {
      return { type: 'invalid', message: `Invalid join filter "${key}": "${alias}" is not a joined table` };
    }
    const expectedParent = index === 0 ? null : aliases[index - 1];
    const actualParent = logicalParentAlias(operation, operations, mainTableName);
    if (actualParent !== expectedParent) {
      const where = actualParent ? `"${actualParent}"` : 'the root collection';
      return { type: 'invalid', message: `Invalid join filter "${key}": "${alias}" is nested under ${where}` };
    }
  }

  const crossesMany = aliases.some(alias => findJoinOperation(operations, alias) instanceof LeftJoinMany);
  return { type: 'join', aliases, column, crossesMany };
}

export interface JoinFilter {
  key: string;
  filter: Filter;
  aliases: string[];
  column: string;
  crossesMany: boolean;
}

export function partitionFilters(
  queryOptions: IQueryOptions,
  operations: Operation[],
  mainTableName: string,
): { rootOptions: IQueryOptions; joinFilters: JoinFilter[] } {
  const rootFilters: { [key: string]: Filter } = {};
  const joinFilters: JoinFilter[] = [];

  for (const [key, filter] of Object.entries(queryOptions.filters ?? {})) {
    if (!filter) {
      continue;
    }
    const classified = classifyFilterKey(key, operations, mainTableName);
    if (classified.type === 'invalid') {
      throw new BadRequestError(classified.message);
    }
    if (classified.type === 'root') {
      rootFilters[key] = filter;
      continue;
    }
    joinFilters.push({
      key,
      filter,
      aliases: classified.aliases,
      column: classified.column,
      crossesMany: classified.crossesMany,
    });
  }

  return {
    rootOptions: { ...queryOptions, filters: rootFilters },
    joinFilters,
  };
}

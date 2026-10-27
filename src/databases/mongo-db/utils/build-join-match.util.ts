import type { Filter } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { Document, ObjectId } from 'mongodb';
import type { Operation } from '../../operations/operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
import { PROPERTIES_THAT_ARE_NOT_OBJECT_IDS } from '../../models/constants.js';
import { findJoinOperation, type JoinFilter } from '../../utils/resolve-join-filter.js';

function shouldConvertEqToObjectId(column: string): boolean {
  if (PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(column)) {
    return false;
  }
  return column === '_id' || column.endsWith('Id');
}

function shouldConvertInToObjectIds(column: string): boolean {
  if (PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(column)) {
    return false;
  }
  return column === '_id' || column.endsWith('Id') || column.endsWith('Ids');
}

function convertEqValue(column: string, value: unknown): unknown {
  if (shouldConvertEqToObjectId(column) && typeof value === 'string' && entityUtils.isValidObjectId(value)) {
    return new ObjectId(value);
  }
  if (typeof value === 'string' && !isNaN(Number(value))) {
    return Number(value);
  }
  return value;
}

function convertInValues(column: string, values: unknown[]): { values: unknown[]; dropped: boolean } {
  if (shouldConvertInToObjectIds(column)) {
    const objectIds = values
      .filter(val => typeof val === 'string' && entityUtils.isValidObjectId(val))
      .map(val => new ObjectId(val as string));
    if (objectIds.length === 0) {
      return { values: [], dropped: true };
    }
    return { values: objectIds, dropped: false };
  }
  return {
    values: values.map(val => typeof val === 'string' && !isNaN(Number(val)) ? Number(val) : val),
    dropped: false,
  };
}

function compareExpression(fieldExpr: string, column: string, filter: Filter): Document | null {
  const parts: Document[] = [];
  if (filter.eq !== undefined) {
    parts.push({ $eq: [fieldExpr, convertEqValue(column, filter.eq)] });
  }
  if (filter.ne !== undefined) {
    parts.push({ $ne: [fieldExpr, convertEqValue(column, filter.ne)] });
  }
  if (filter.in !== undefined && Array.isArray(filter.in)) {
    const converted = convertInValues(column, filter.in);
    if (!converted.dropped) {
      parts.push({ $in: [fieldExpr, converted.values] });
    }
  }
  if (filter.gte !== undefined) {
    parts.push({ $gte: [fieldExpr, filter.gte] });
  }
  if (filter.lte !== undefined) {
    parts.push({ $lte: [fieldExpr, filter.lte] });
  }
  if (filter.gt !== undefined) {
    parts.push({ $gt: [fieldExpr, filter.gt] });
  }
  if (filter.lt !== undefined) {
    parts.push({ $lt: [fieldExpr, filter.lt] });
  }
  if (filter.contains !== undefined) {
    parts.push({
      $cond: [
        { $eq: [{ $type: fieldExpr }, 'string'] },
        { $regexMatch: { input: fieldExpr, regex: filter.contains, options: 'i' } },
        false,
      ],
    });
  }
  if (parts.length === 0) {
    return null;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return { $and: parts };
}

function scalarAssignment(column: string, filter: Filter): unknown | undefined {
  const ops: Record<string, unknown> = {};
  if (filter.eq !== undefined) {
    ops.$eq = convertEqValue(column, filter.eq);
  }
  if (filter.ne !== undefined) {
    ops.$ne = convertEqValue(column, filter.ne);
  }
  if (filter.in !== undefined && Array.isArray(filter.in)) {
    const converted = convertInValues(column, filter.in);
    if (!converted.dropped) {
      ops.$in = converted.values;
    }
  }
  if (filter.gte !== undefined) {
    ops.$gte = filter.gte;
  }
  if (filter.lte !== undefined) {
    ops.$lte = filter.lte;
  }
  if (filter.gt !== undefined) {
    ops.$gt = filter.gt;
  }
  if (filter.lt !== undefined) {
    ops.$lt = filter.lt;
  }
  if (filter.contains !== undefined) {
    ops.$regex = filter.contains;
    ops.$options = 'i';
  }
  const keys = Object.keys(ops);
  if (keys.length === 0) {
    return undefined;
  }
  if (keys.length === 1 && keys[0] === '$eq') {
    return ops.$eq;
  }
  return ops;
}

function anyMatchExpression(joinFilter: JoinFilter, operations: Operation[]): Document | null {
  const walk = (scope: string, index: number): Document | null => {
    const alias = joinFilter.aliases[index];
    const operation = findJoinOperation(operations, alias);
    if (!operation) {
      return null;
    }
    const here = scope ? `${scope}.${alias}` : `$_joinData.${alias}`;
    const isLast = index === joinFilter.aliases.length - 1;
    if (operation instanceof LeftJoinMany) {
      const varName = `j${index}`;
      const cond = isLast
        ? compareExpression(`$$${varName}.${joinFilter.column}`, joinFilter.column, joinFilter.filter)
        : walk(`$$${varName}`, index + 1);
      if (!cond) {
        return null;
      }
      return {
        $gt: [
          {
            $size: {
              $filter: {
                input: { $ifNull: [here, []] },
                as: varName,
                cond,
              },
            },
          },
          0,
        ],
      };
    }
    if (isLast) {
      return compareExpression(`${here}.${joinFilter.column}`, joinFilter.column, joinFilter.filter);
    }
    return walk(here, index + 1);
  };
  return walk('', 0);
}

/** $match applied after lookups so join filters see `_joinData`. */
export function buildJoinMatchStage(joinFilters: JoinFilter[], operations: Operation[]): Document | null {
  const match: Record<string, unknown> = {};
  const expressions: Document[] = [];

  for (const joinFilter of joinFilters) {
    if (joinFilter.crossesMany) {
      const expression = anyMatchExpression(joinFilter, operations);
      if (expression) {
        expressions.push(expression);
      }
      continue;
    }
    const assignment = scalarAssignment(joinFilter.column, joinFilter.filter);
    if (assignment !== undefined) {
      match[`_joinData.${joinFilter.aliases.join('.')}.${joinFilter.column}`] = assignment;
    }
    if (joinFilter.filter.ne !== undefined) {
      match[`_joinData.${joinFilter.aliases.join('.')}`] = { $ne: null };
    }
  }

  if (expressions.length === 1) {
    match.$expr = expressions[0];
  } else if (expressions.length > 1) {
    match.$expr = { $and: expressions };
  }
  if (Object.keys(match).length === 0) {
    return null;
  }
  return { $match: match };
}

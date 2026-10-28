import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { toPostgresStoreName } from './convert-keys.util.js';

function getParentAlias(localField: string): string | null {
  if (!localField.includes('.')) return null;
  return localField.split('.')[0];
}

/** One-to-one aliases placed in the outer FROM. LeftJoinMany and joins whose parent is a many stay in the SELECT subquery. */
export function collectOuterOneToOneAliases(operations: Operation[], mainTableName?: string): Set<string> {
  const aliases = new Set<string>();
  for (const operation of operations) {
    if (!(operation instanceof LeftJoin) && !(operation instanceof InnerJoin)) {
      continue;
    }
    const parent = getParentAlias(operation.localField);
    const parentInScope = parent === null || parent === mainTableName || aliases.has(parent);
    if (!parentInScope) {
      continue;
    }
    aliases.add(operation.as);
  }
  return aliases;
}

/**
 * Builds SQL JOIN clauses for one-to-one joins whose parent is the main table or another outer join.
 * LeftJoinMany and joins that hang off a many are omitted; the SELECT clause aggregates those.
 *
 * @param operations - Join operations to build clauses for
 * @param mainTableName - Optional main table name; when provided, the join table is aliased (AS) and the ON clause left side is qualified for the main table
 */
export function buildJoinClauses(
  operations: Operation[],
  mainTableName?: string,
): string {
  const joinClauses: string[] = [];
  const oneToOneAliasesInScope = collectOuterOneToOneAliases(operations, mainTableName);

  for (const operation of operations) {
    if (!(operation instanceof LeftJoin) && !(operation instanceof InnerJoin)) {
      continue;
    }
    if (!oneToOneAliasesInScope.has(operation.as)) {
      continue;
    }

    const joinType = operation instanceof LeftJoin ? 'LEFT JOIN' : 'INNER JOIN';
    let leftSide: string;
    if (operation.localField.includes('.')) {
      const [alias, column] = operation.localField.split('.');
      leftSide = `"${alias}"."${column}"`;
    } else {
      leftSide = mainTableName ? `"${mainTableName}"."${operation.localField}"` : `"${operation.localField}"`;
    }
    const fromTable = toPostgresStoreName(operation.from);
    joinClauses.push(`${joinType} "${fromTable}" AS "${operation.as}" ON ${leftSide} = "${operation.as}"."${operation.foreignField}"`);
  }
  return joinClauses.join(' ');
}

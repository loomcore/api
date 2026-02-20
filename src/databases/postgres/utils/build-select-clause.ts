import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';

const PK = '_id';

/**
 * Gets column names for a table from PostgreSQL information_schema
 */
export async function getTableColumns(client: Client, tableName: string): Promise<string[]> {
    const result = await client.query<{ column_name: string }>(
        `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = $1
            ORDER BY ordinal_position
        `,
        [tableName]
    );
    return result.rows.map(row => row.column_name);
}

/** Returns the parent alias for a join (e.g. "client_person" from "client_person._id"), or null if top-level */
function getParentAlias(localField: string): string | null {
    if (!localField.includes('.')) return null;
    return localField.split('.')[0];
}

/** Returns operations that are direct children of the given parent alias */
function getChildOperations(operations: Operation[], parentAlias: string): Operation[] {
    return operations.filter(op => {
        const p = getParentAlias(op.localField);
        return p === parentAlias;
    });
}

/** Returns operations that are top-level (parent is main table) */
function getTopLevelOperations(operations: Operation[], mainTableName: string): Operation[] {
    return operations.filter(op => {
        const p = getParentAlias(op.localField);
        return p === null || p === mainTableName;
    });
}

/** Escapes a string for use inside single-quoted SQL literal (for json key names) */
function sqlQuote(s: string): string {
    return "'" + s.replace(/'/g, "''") + "'";
}

/** Builds jsonb_build_object( key1, expr1, key2, expr2, ... ) from an array of [key, expr] pairs */
function jsonbBuildObject(entries: Array<{ key: string; expr: string }>): string {
    if (entries.length === 0) return "''{}''::jsonb";
    const parts = entries.flatMap(({ key, expr }) => [sqlQuote(key), expr]);
    return `jsonb_build_object(${parts.join(', ')})`;
}

/** Builds the parent ref expression: either "main"."localField" or "parent_alias"."column" */
function buildParentRef(
    localField: string,
    mainTableName: string
): string {
    if (!localField.includes('.')) {
        return `"${mainTableName}"."${localField}"`;
    }
    const [alias, column] = localField.split('.');
    return `"${alias}"."${column}"`;
}

/**
 * Builds SQL for a one-to-one join value: CASE WHEN alias has row THEN jsonb_build_object(...) ELSE NULL END.
 * Includes nested children (one-to-one and many) inside the object.
 */
async function buildOneToOneValue(
    client: Client,
    op: LeftJoin | InnerJoin,
    operations: Operation[],
    mainTableName: string,
    inScopeAliases: Set<string>
): Promise<string> {
    const alias = op.as;
    const columns = await getTableColumns(client, op.from);
    const childOps = getChildOperations(operations, alias);

    const entries: Array<{ key: string; expr: string }> = columns.map(col => ({
        key: col,
        expr: `"${alias}"."${col}"`
    }));

    for (const child of childOps) {
        if (child instanceof LeftJoin || child instanceof InnerJoin) {
            const childVal = await buildOneToOneValue(client, child, operations, mainTableName, inScopeAliases);
            entries.push({ key: child.as, expr: childVal });
        } else if (child instanceof LeftJoinMany) {
            const childVal = await buildManyValue(client, child, operations, mainTableName, alias, inScopeAliases);
            entries.push({ key: child.as, expr: childVal });
        }
    }

    const obj = jsonbBuildObject(entries);
    return `CASE WHEN "${alias}"."${PK}" IS NOT NULL THEN ${obj} ELSE NULL END`;
}

/**
 * Finds the through-table InnerJoin when localField is "through_alias.column" (many-to-many).
 */
function getThroughJoin(operations: Operation[], localField: string): InnerJoin | null {
    if (!localField.includes('.')) return null;
    const throughAlias = localField.split('.')[0];
    const throughOp = operations.find(
        o => o instanceof InnerJoin && o.as === throughAlias
    ) as InnerJoin | undefined;
    return throughOp ?? null;
}

/** Returns aliases that are used as through-tables by any LeftJoinMany in the given child ops. Those should not be joined in the aggregation FROM (they would multiply rows). */
function getThroughAliasesUsedBySiblings(childOps: Operation[]): Set<string> {
    const throughAliases = new Set<string>();
    for (const op of childOps) {
        if (op instanceof LeftJoinMany && op.localField.includes('.')) {
            throughAliases.add(op.localField.split('.')[0]);
        }
    }
    return throughAliases;
}

/**
 * Builds SQL for a one-to-many join value: (SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) FROM ... WHERE ...).
 * Handles direct many, many-via-through, and nested one-to-one/one-to-many inside the aggregated item.
 */
async function buildManyValue(
    client: Client,
    op: LeftJoinMany,
    operations: Operation[],
    mainTableName: string,
    parentAlias: string,
    inScopeAliases: Set<string>
): Promise<string> {
    const alias = op.as;
    const columns = await getTableColumns(client, op.from);
    const childOps = getChildOperations(operations, alias);
    const throughJoin = getThroughJoin(operations, op.localField);

    const parentRef = buildParentRef(op.localField, mainTableName);

    // Build FROM: base (with optional through) + LEFT JOINs for one-to-one children so we can reference them in the item
    let fromClause: string;
    let whereClause: string;

    if (throughJoin) {
        const throughAlias = throughJoin.as;
        const linkColumn = op.localField.split('.')[1];
        fromClause = `"${throughJoin.from}" AS "${throughAlias}" INNER JOIN "${op.from}" AS "${alias}" ON "${throughAlias}"."${linkColumn}" = "${alias}"."${op.foreignField}"`;
        const throughParentRef = buildParentRef(throughJoin.localField, mainTableName);
        whereClause = `"${throughAlias}"."${throughJoin.foreignField}" = ${throughParentRef}`;
    } else {
        fromClause = `"${op.from}" AS "${alias}"`;
        whereClause = `"${alias}"."${op.foreignField}" = ${parentRef}`;
    }

    const throughAliasesUsedBySiblings = getThroughAliasesUsedBySiblings(childOps);
    const oneToOneChildren = childOps.filter(c => c instanceof LeftJoin || c instanceof InnerJoin);
    for (const child of oneToOneChildren) {
        const leftCol = child.localField.includes('.') ? child.localField.split('.')[1] : child.localField;
        fromClause += ` LEFT JOIN "${child.from}" AS "${child.as}" ON "${alias}"."${leftCol}" = "${child.as}"."${child.foreignField}"`;
    }

    // Build the aggregated item: jsonb_build_object(columns, nested one-to-one, nested many)
    const itemEntries: Array<{ key: string; expr: string }> = columns.map(col => ({
        key: col,
        expr: `"${alias}"."${col}"`
    }));

    for (const child of childOps) {
        if (child instanceof LeftJoin || child instanceof InnerJoin) {
            const childColumns = await getTableColumns(client, child.from);
            const nestedChildOps = getChildOperations(operations, child.as);
            const nestedEntries: Array<{ key: string; expr: string }> = childColumns.map(c => ({
                key: c,
                expr: `"${child.as}"."${c}"`
            }));
            for (const n of nestedChildOps) {
                if (n instanceof LeftJoin || n instanceof InnerJoin) {
                    const grandCols = await getTableColumns(client, n.from);
                    nestedEntries.push(...grandCols.map(c => ({ key: c, expr: `"${n.as}"."${c}"` })));
                } else if (n instanceof LeftJoinMany) {
                    const sub = await buildManyValue(client, n, operations, mainTableName, child.as, inScopeAliases);
                    nestedEntries.push({ key: n.as, expr: sub });
                }
            }
            const nestedObj = jsonbBuildObject(nestedEntries);
            itemEntries.push({
                key: child.as,
                expr: `CASE WHEN "${child.as}"."${PK}" IS NOT NULL THEN ${nestedObj} ELSE NULL END`
            });
        } else if (child instanceof LeftJoinMany) {
            const sub = await buildManyValue(client, child, operations, mainTableName, alias, inScopeAliases);
            itemEntries.push({ key: child.as, expr: sub });
        }
    }

    const itemExpr = jsonbBuildObject(itemEntries);

    // Through-table joins multiply rows (e.g. one policy per agent). Deduplicate by parent PK before aggregating.
    if (throughAliasesUsedBySiblings.size > 0) {
        const orderByPk = `"${alias}"."${PK}"`;
        const innerSelect = `SELECT DISTINCT ON (${orderByPk}) ${itemExpr} AS item FROM ${fromClause} WHERE ${whereClause} ORDER BY ${orderByPk}`;
        return `(SELECT COALESCE(jsonb_agg(sub.item), '[]'::jsonb) FROM (${innerSelect}) sub)`;
    }
    return `(SELECT COALESCE(jsonb_agg(${itemExpr}), '[]'::jsonb) FROM ${fromClause} WHERE ${whereClause})`;
}

/**
 * Builds the _joinData object SQL for top-level joins only.
 */
async function buildJoinDataObject(
    client: Client,
    operations: Operation[],
    mainTableName: string
): Promise<string> {
    const topLevel = getTopLevelOperations(operations, mainTableName);
    const oneToOneAliases = new Set(
        operations.filter(o => o instanceof LeftJoin || o instanceof InnerJoin).map(o => o.as)
    );

    const entries: Array<{ key: string; expr: string }> = [];

    for (const op of topLevel) {
        if (op instanceof LeftJoin || op instanceof InnerJoin) {
            const val = await buildOneToOneValue(client, op, operations, mainTableName, oneToOneAliases);
            entries.push({ key: op.as, expr: val });
        } else if (op instanceof LeftJoinMany) {
            const parentRef = buildParentRef(op.localField, mainTableName);
            const val = await buildManyValue(client, op, operations, mainTableName, mainTableName, oneToOneAliases);
            entries.push({ key: op.as, expr: val });
        }
    }

    if (entries.length === 0) return "''{}''::jsonb";
    return jsonbBuildObject(entries);
}

/**
 * Builds a SELECT clause that returns a single column "entity" as a jsonb object.
 * Uses jsonb_build_object and jsonb_agg (in correlated subqueries) so no post-process transform is needed.
 *
 * - Main table: all columns at root plus _joinData
 * - LeftJoin/InnerJoin: in FROM; value = CASE WHEN row present THEN jsonb_build_object(...) ELSE NULL
 * - LeftJoinMany: correlated subquery (SELECT jsonb_agg(...) FROM many_table WHERE fk = parent_ref)
 *
 * Note: Correlated subqueries and jsonb functions require real PostgreSQL. The in-memory test driver
 * (pg-mem) may not resolve outer scope in subqueries or support all jsonb_build_object signatures;
 * run join tests with USE_REAL_POSTGRES=true to validate.
 */
export async function buildSelectClause(
    client: Client,
    mainTableName: string,
    operations: Operation[]
): Promise<string> {
    const leftJoinOperations = operations.filter(op => op instanceof LeftJoin) as LeftJoin[];
    const innerJoinOperations = operations.filter(op => op instanceof InnerJoin) as InnerJoin[];
    const leftJoinManyOperations = operations.filter(op => op instanceof LeftJoinMany) as LeftJoinMany[];

    const hasJoins = leftJoinOperations.length > 0 || innerJoinOperations.length > 0 || leftJoinManyOperations.length > 0;

    if (!hasJoins) {
        return '*';
    }

    const mainColumns = await getTableColumns(client, mainTableName);
    const mainEntries: Array<{ key: string; expr: string }> = mainColumns.map(col => ({
        key: col,
        expr: `"${mainTableName}"."${col}"`
    }));

    const joinDataExpr = await buildJoinDataObject(client, operations, mainTableName);
    mainEntries.push({ key: '_joinData', expr: joinDataExpr });

    const entityExpr = jsonbBuildObject(mainEntries);
    return `${entityExpr} AS entity`;
}

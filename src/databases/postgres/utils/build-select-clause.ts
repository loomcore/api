import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
import { toSnakeCase } from './convert-keys.util.js';

/**
 * Converts a field name to snake_case for database column names.
 * Preserves keys that start with underscore (e.g. _id).
 */
function convertFieldToSnakeCase(field: string): string {
    if (field.startsWith('_')) {
        return field;
    }
    return toSnakeCase(field);
}

/**
 * Resolves the local side of a join to a SQL expression (for use in scalar subquery correlation).
 * - Direct: "categoryId" -> "mainTable"."category_id"
 * - Nested: "clients._id" -> clients."_id"
 */
function resolveLocalRef(localField: string, mainTableName: string): string {
    if (!localField.includes('.')) {
        const snake = convertFieldToSnakeCase(localField);
        return `"${mainTableName}"."${snake}"`;
    }
    const [alias, field] = localField.split('.');
    const snake = convertFieldToSnakeCase(field);
    return `${alias}."${snake}"`;
}

/**
 * Gets column names for a table from PostgreSQL information_schema
 */
async function getTableColumns(client: Client, tableName: string): Promise<string[]> {
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

/**
 * Checks if an operation enriches another array join.
 */
function findEnrichmentTarget(
    operation: LeftJoinMany,
    operations: Operation[]
): { target: LeftJoinMany; field: string } | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias] = operation.localField.split('.');
    const target = operations.find(op =>
        op instanceof LeftJoinMany && op.as === alias
    ) as LeftJoinMany | undefined;

    if (target && operations.indexOf(target) < operations.indexOf(operation)) {
        return { target, field: operation.localField.split('.')[1] };
    }

    return null;
}

/**
 * Builds a SELECT clause with explicit column names and table aliases.
 * 
 * - Main table: all columns with table prefix
 * - LeftJoin/InnerJoin (one-to-one): columns prefixed with alias (e.g., "category__id")
 * - LeftJoinMany (arrays): scalar subquery with jsonb_agg(jsonb_build_object(...))
 */
export async function buildSelectClause(
    client: Client,
    mainTableName: string,
    mainTableAlias: string,
    operations: Operation[]
): Promise<string> {
    const leftJoinOperations = operations.filter(op => op instanceof LeftJoin) as LeftJoin[];
    const innerJoinOperations = operations.filter(op => op instanceof InnerJoin) as InnerJoin[];
    const leftJoinManyOperations = operations.filter(op => op instanceof LeftJoinMany) as LeftJoinMany[];

    // Main table columns
    const mainTableColumns = await getTableColumns(client, mainTableName);
    const mainSelects = mainTableColumns.map(col => `"${mainTableName}"."${col}" AS "${col}"`);

    const joinSelects: string[] = [];

    // One-to-one joins: select columns with prefix
    for (const join of [...leftJoinOperations, ...innerJoinOperations]) {
        const joinColumns = await getTableColumns(client, join.from);
        for (const col of joinColumns) {
            joinSelects.push(`${join.as}."${col}" AS "${join.as}__${col}"`);
        }
    }

    // LeftJoinMany: scalar subquery with jsonb_agg and jsonb_build_object (no .aggregated)
    // Skip enrichment operations - they're embedded in their target joins
    for (const joinMany of leftJoinManyOperations) {
        const enrichment = findEnrichmentTarget(joinMany, operations);
        if (enrichment) {
            continue;
        }
        const manyColumns = await getTableColumns(client, joinMany.from);
        const foreignSnake = convertFieldToSnakeCase(joinMany.foreignField);
        const localRef = resolveLocalRef(joinMany.localField, mainTableName);
        const subAlias = `_sub_${joinMany.as}`;
        const objParts = manyColumns.map(c => `'${c.replace(/'/g, "''")}', ${subAlias}."${c}"`).join(', ');
        const subquery = `(SELECT COALESCE(jsonb_agg(jsonb_build_object(${objParts})), '[]'::jsonb) FROM "${joinMany.from}" AS ${subAlias} WHERE ${subAlias}."${foreignSnake}" = ${localRef})`;
        joinSelects.push(`${subquery} AS "${joinMany.as}"`);
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}

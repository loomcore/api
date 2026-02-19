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
 * - LeftJoinMany array: "client_policies._id" -> extracts _id values from JSON array
 */
function resolveLocalRef(
    localField: string,
    mainTableName: string,
    operations: Operation[],
    currentIndex: number
): string {
    if (!localField.includes('.')) {
        const snake = convertFieldToSnakeCase(localField);
        return `"${mainTableName}"."${snake}"`;
    }
    const [alias, field] = localField.split('.');
    const snake = convertFieldToSnakeCase(field);
    
    // Check if alias references a previous LeftJoinMany (which is a JSON array, not a table)
    const priorOps = operations.slice(0, currentIndex);
    const leftJoinMany = priorOps.find(
        (op): op is LeftJoinMany => op instanceof LeftJoinMany && op.as === alias
    );
    
    if (leftJoinMany) {
        // Extract field values from the JSON array as a subquery for use with ANY()
        // Cast to appropriate type based on field name (assume integer for _id, text otherwise)
        const castType = field === '_id' || snake === '_id' ? '::int' : '::text';
        return `(SELECT jsonb_array_elements("${alias}")->>'${snake}'${castType})`;
    }
    
    // Regular table alias reference
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
    for (let i = 0; i < leftJoinManyOperations.length; i++) {
        const joinMany = leftJoinManyOperations[i];
        const enrichment = findEnrichmentTarget(joinMany, operations);
        if (enrichment) {
            continue;
        }
        const manyColumns = await getTableColumns(client, joinMany.from);
        const foreignSnake = convertFieldToSnakeCase(joinMany.foreignField);
        const currentOpIndex = operations.indexOf(joinMany);
        const localRef = resolveLocalRef(joinMany.localField, mainTableName, operations, currentOpIndex);
        const subAlias = `_sub_${joinMany.as}`;
        const objParts = manyColumns.map(c => `'${c.replace(/'/g, "''")}', ${subAlias}."${c}"`).join(', ');
        
        // If localRef references a JSON array (previous LeftJoinMany), use ANY() with the subquery
        const isArrayRef = joinMany.localField.includes('.') && 
            operations.slice(0, currentOpIndex).some(
                op => op instanceof LeftJoinMany && op.as === joinMany.localField.split('.')[0]
            );
        
        let whereClause: string;
        if (isArrayRef) {
            // Use IN with subquery: foreignField IN (SELECT jsonb_array_elements(...)->>'field')
            whereClause = `${subAlias}."${foreignSnake}" IN ${localRef}`;
        } else {
            // Regular equality
            whereClause = `${subAlias}."${foreignSnake}" = ${localRef}`;
        }
        
        const subquery = `(SELECT COALESCE(jsonb_agg(jsonb_build_object(${objParts})), '[]'::jsonb) FROM "${joinMany.from}" AS ${subAlias} WHERE ${whereClause})`;
        joinSelects.push(`${subquery} AS "${joinMany.as}"`);
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}

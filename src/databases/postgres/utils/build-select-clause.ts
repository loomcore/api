import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { JoinThroughMany } from '../../operations/join-through-many.operation.js';

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
    operation: JoinMany | JoinThroughMany,
    operations: Operation[]
): { target: JoinMany | JoinThroughMany; field: string } | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias] = operation.localField.split('.');
    const target = operations.find(op =>
        (op instanceof JoinMany || op instanceof JoinThroughMany) && op.as === alias
    ) as JoinMany | JoinThroughMany | undefined;

    if (target && operations.indexOf(target) < operations.indexOf(operation)) {
        return { target, field: operation.localField.split('.')[1] };
    }

    return null;
}

/**
 * Builds a SELECT clause with explicit column names and table aliases.
 * 
 * - Main table: all columns with table prefix
 * - Join (one-to-one): columns prefixed with alias (e.g., "category__id")
 * - JoinMany/JoinThroughMany (arrays): JSON aggregated column
 * - JoinThrough (single object): JSON object column
 */
export async function buildSelectClause(
    client: Client,
    mainTableName: string,
    mainTableAlias: string,
    operations: Operation[]
): Promise<string> {
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    const joinManyOperations = operations.filter(op => op instanceof JoinMany) as JoinMany[];
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    const joinThroughManyOperations = operations.filter(op => op instanceof JoinThroughMany) as JoinThroughMany[];

    // Main table columns
    const mainTableColumns = await getTableColumns(client, mainTableName);
    const mainSelects = mainTableColumns.map(col => `"${mainTableName}"."${col}" AS "${col}"`);

    const joinSelects: string[] = [];

    // One-to-one joins: select columns with prefix
    for (const join of joinOperations) {
        const joinColumns = await getTableColumns(client, join.from);
        for (const col of joinColumns) {
            joinSelects.push(`${join.as}."${col}" AS "${join.as}__${col}"`);
        }
    }

    // JoinThrough: single JSON object
    for (const joinThrough of joinThroughOperations) {
        joinSelects.push(`${joinThrough.as}.aggregated AS "${joinThrough.as}"`);
    }

    // JoinMany: JSON array
    // Skip enrichment operations - they're embedded in their target joins
    for (const joinMany of joinManyOperations) {
        const enrichment = findEnrichmentTarget(joinMany, operations);
        if (enrichment) {
            // This is an enrichment operation - skip it (it's embedded in the target)
            continue;
        }
        joinSelects.push(`${joinMany.as}.aggregated AS "${joinMany.as}"`);
    }

    // JoinThroughMany: JSON array
    // Skip enrichment operations - they're embedded in their target joins
    for (const joinThroughMany of joinThroughManyOperations) {
        const enrichment = findEnrichmentTarget(joinThroughMany, operations);
        if (enrichment) {
            // This is an enrichment operation - skip it (it's embedded in the target)
            continue;
        }
        joinSelects.push(`${joinThroughMany.as}.aggregated AS "${joinThroughMany.as}"`);
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}

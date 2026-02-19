import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';

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
 * - LeftJoinMany (arrays): JSON aggregated column
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
    for (const join of [...leftJoinOperations, ...leftJoinManyOperations, ...innerJoinOperations]) {
        const joinColumns = await getTableColumns(client, join.from);
        for (const col of joinColumns) {
            joinSelects.push(`${join.as}."${col}" AS "${join.as}__${col}"`);
        }
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}

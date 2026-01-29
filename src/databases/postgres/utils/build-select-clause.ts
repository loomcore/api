import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';

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
 * Builds a SELECT clause with explicit column names and table aliases.
 * This ensures that columns from joined tables are properly prefixed,
 * allowing us to distinguish them from main table columns.
 * 
 * For array joins (JoinMany, JoinThrough), uses JSON aggregation subqueries.
 * 
 * @param client - PostgreSQL client
 * @param mainTableName - Name of the main table
 * @param mainTableAlias - Alias for the main table (defaults to mainTableName)
 * @param operations - Array of operations (includes Join operations)
 * @returns SELECT clause string
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

    // Get main table columns
    // Use the table name directly (with quotes) since we don't alias the main table in FROM
    const mainTableColumns = await getTableColumns(client, mainTableName);
    const mainSelects = mainTableColumns.map(col => `"${mainTableName}"."${col}" AS "${col}"`);

    // Get joined table columns for one-to-one joins
    // Instead of using JSON functions, we'll select columns with prefixes
    // and transform them in JavaScript (simpler and more reliable)
    const joinSelects: string[] = [];
    for (const join of joinOperations) {
        const joinColumns = await getTableColumns(client, join.from);
        if (joinColumns.length === 0) {
            continue;
        }
        // Select each column from joined table with a prefix
        // Format: category._id AS category__id, category.name AS category__name
        for (const col of joinColumns) {
            joinSelects.push(`${join.as}."${col}" AS "${join.as}__${col}"`);
        }
    }

    // Handle JoinMany operations (many-to-one) - handled via LATERAL joins in FROM clause
    // Select the aggregated JSON array from the LATERAL join
    for (const joinMany of joinManyOperations) {
        joinSelects.push(`${joinMany.as}.aggregated AS "${joinMany.as}"`);
    }

    // Handle JoinThrough operations (many-to-many via join table) - handled via LATERAL joins in FROM clause
    // Select the aggregated JSON array from the LATERAL join
    for (const joinThrough of joinThroughOperations) {
        joinSelects.push(`${joinThrough.as}.aggregated AS "${joinThrough.as}"`);
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}


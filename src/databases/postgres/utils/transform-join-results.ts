import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';

/**
 * Transforms PostgreSQL JOIN results with prefixed columns into nested objects.
 * 
 * When using buildSelectClause, joined table columns are selected with prefixes
 * like "category__id", "category__name". This function groups these prefixed
 * columns into nested objects under the join alias (e.g., category: { _id, name }).
 * 
 * @param rows - Rows from a JOIN query with prefixed column names
 * @param operations - Array of operations (includes Join operations)
 * @returns Transformed rows with nested joined data
 */
export function transformJoinResults<T>(
    rows: any[],
    operations: Operation[]
): T[] {
    // If no joins, return rows as-is
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    if (joinOperations.length === 0) {
        return rows as T[];
    }

    // Transform each row
    return rows.map(row => {
        const transformed: any = {};
        
        // First, copy all main table columns (those without the join prefix)
        for (const key of Object.keys(row)) {
            const hasJoinPrefix = joinOperations.some(join => key.startsWith(`${join.as}__`));
            if (!hasJoinPrefix) {
                transformed[key] = row[key];
            }
        }

        // Then, group prefixed columns into nested objects
        for (const join of joinOperations) {
            const prefix = `${join.as}__`;
            const joinedData: any = {};
            let hasAnyData = false;

            // Find all columns with this prefix
            for (const key of Object.keys(row)) {
                if (key.startsWith(prefix)) {
                    const columnName = key.substring(prefix.length);
                    const value = row[key];
                    joinedData[columnName] = value;
                    if (value !== null && value !== undefined) {
                        hasAnyData = true;
                    }
                }
            }

            // Only add the joined object if there's data, otherwise set to null
            transformed[join.as] = hasAnyData ? joinedData : null;
        }

        return transformed as T;
    });
}


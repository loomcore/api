import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';

/**
 * Transforms PostgreSQL JOIN results with prefixed columns into nested objects.
 * 
 * When using buildSelectClause:
 * - One-to-one joins: columns are selected with prefixes like "category__id", "category__name"
 * - Array joins (JoinMany, JoinThrough): columns are already JSON arrays from subqueries
 * 
 * This function groups prefixed columns into nested objects and parses JSON arrays.
 * 
 * @param rows - Rows from a JOIN query with prefixed column names or JSON arrays
 * @param operations - Array of operations (includes Join operations)
 * @returns Transformed rows with nested joined data
 */
export function transformJoinResults<T>(
    rows: any[],
    operations: Operation[]
): T[] {
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    const joinManyOperations = operations.filter(op => op instanceof JoinMany) as JoinMany[];
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    
    // If no joins, return rows as-is
    if (joinOperations.length === 0 && joinManyOperations.length === 0 && joinThroughOperations.length === 0) {
        return rows as T[];
    }

    // Transform each row
    return rows.map(row => {
        const transformed: any = {};
        
        // First, copy all main table columns (those without any join prefix or alias)
        const allJoinAliases = [
            ...joinOperations.map(j => j.as),
            ...joinManyOperations.map(j => j.as),
            ...joinThroughOperations.map(j => j.as)
        ];
        
        for (const key of Object.keys(row)) {
            const hasJoinPrefix = joinOperations.some(join => key.startsWith(`${join.as}__`));
            const isJoinAlias = allJoinAliases.includes(key);
            
            if (!hasJoinPrefix && !isJoinAlias) {
                transformed[key] = row[key];
            }
        }

        // Handle one-to-one joins: group prefixed columns into nested objects
        // Process joins in order, handling nested joins (e.g., "agent.person_id")
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

            // Check if this Join references a joined table (nested join)
            if (join.localField.includes('.')) {
                const [tableAlias] = join.localField.split('.');
                const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                // Check if related join exists and has been processed (exists in transformed)
                // Also check if it's not null (join returned data)
                if (relatedJoin && transformed[relatedJoin.as] !== undefined && transformed[relatedJoin.as] !== null) {
                    // Nest under the related join's alias (e.g., agent.person)
                    // Only nest if there's data, otherwise leave it null/undefined
                    if (hasAnyData) {
                        transformed[relatedJoin.as][join.as] = joinedData;
                    } else {
                        transformed[relatedJoin.as][join.as] = null;
                    }
                } else {
                    // Fallback: add at top level
                    transformed[join.as] = hasAnyData ? joinedData : null;
                }
            } else {
                // Add at top level
                transformed[join.as] = hasAnyData ? joinedData : null;
            }
        }

        // Handle array joins (JoinMany): parse JSON arrays
        // If localField references a joined table (e.g., "person._id"), nest under that join's alias
        for (const joinMany of joinManyOperations) {
            const jsonValue = row[joinMany.as];
            let parsedValue: any;
            
            if (jsonValue !== null && jsonValue !== undefined) {
                // Parse JSON if it's a string, otherwise use as-is
                parsedValue = typeof jsonValue === 'string' 
                    ? JSON.parse(jsonValue) 
                    : jsonValue;
            } else {
                parsedValue = [];
            }
            
            // Check if this JoinMany references a joined table
            if (joinMany.localField.includes('.')) {
                const [tableAlias] = joinMany.localField.split('.');
                const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                if (relatedJoin && transformed[relatedJoin.as]) {
                    // Nest under the related join's alias (e.g., person.email_addresses)
                    transformed[relatedJoin.as][joinMany.as] = parsedValue;
                } else {
                    // Fallback: add at top level
                    transformed[joinMany.as] = parsedValue;
                }
            } else {
                // Add at top level
                transformed[joinMany.as] = parsedValue;
            }
        }

        // Handle join-through operations (JoinThrough): parse JSON arrays
        // If localField references a joined table (e.g., "person._id"), nest under that join's alias
        for (const joinThrough of joinThroughOperations) {
            const jsonValue = row[joinThrough.as];
            let parsedValue: any;
            
            if (jsonValue !== null && jsonValue !== undefined) {
                // Parse JSON if it's a string, otherwise use as-is
                parsedValue = typeof jsonValue === 'string' 
                    ? JSON.parse(jsonValue) 
                    : jsonValue;
            } else {
                parsedValue = [];
            }
            
            // Check if this JoinThrough references a joined table
            if (joinThrough.localField.includes('.')) {
                const [tableAlias] = joinThrough.localField.split('.');
                const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                if (relatedJoin && transformed[relatedJoin.as]) {
                    // Nest under the related join's alias (e.g., person.phone_numbers)
                    transformed[relatedJoin.as][joinThrough.as] = parsedValue;
                } else {
                    // Fallback: add at top level
                    transformed[joinThrough.as] = parsedValue;
                }
            } else {
                // Add at top level
                transformed[joinThrough.as] = parsedValue;
            }
        }

        return transformed as T;
    });
}


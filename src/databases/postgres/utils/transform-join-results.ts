import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { JoinThroughMany } from '../../operations/join-through-many.operation.js';

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
    const joinThroughManyOperations = operations.filter(op => op instanceof JoinThroughMany) as JoinThroughMany[];

    // If no joins, return rows as-is
    if (joinOperations.length === 0 && joinManyOperations.length === 0 && joinThroughOperations.length === 0 && joinThroughManyOperations.length === 0) {
        return rows as T[];
    }

    // Transform each row
    return rows.map(row => {
        const transformed: any = {};

        // First, copy all main table columns (those without any join prefix or alias)
        const allJoinAliases = [
            ...joinOperations.map(j => j.as),
            ...joinManyOperations.map(j => j.as),
            ...joinThroughOperations.map(j => j.as),
            ...joinThroughManyOperations.map(j => j.as)
        ];

        for (const key of Object.keys(row)) {
            const hasJoinPrefix = joinOperations.some(join => key.startsWith(`${join.as}__`));
            const isJoinAlias = allJoinAliases.includes(key);

            if (!hasJoinPrefix && !isJoinAlias) {
                transformed[key] = row[key];
            }
        }

        // Process operations in order to handle dependencies correctly
        // We need to process JoinThrough operations that depend on regular Joins,
        // and regular Joins that depend on JoinThrough results
        for (const operation of operations) {
            if (operation instanceof JoinThrough) {
                // Handle join-through operations (JoinThrough): parse single JSON object
                const jsonValue = row[operation.as];
                let parsedValue: any;

                if (jsonValue !== null && jsonValue !== undefined) {
                    // Parse JSON if it's a string, otherwise use as-is
                    parsedValue = typeof jsonValue === 'string'
                        ? JSON.parse(jsonValue)
                        : jsonValue;
                } else {
                    parsedValue = null;
                }

                // Check if this JoinThrough references a joined table
                if (operation.localField.includes('.')) {
                    const [tableAlias] = operation.localField.split('.');
                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);
                    if ((relatedJoin && transformed[relatedJoin.as]) || (relatedJoinThrough && transformed[relatedJoinThrough.as])) {
                        // Nest under the related join's alias (e.g., person.phone_number)
                        const targetAlias = relatedJoin ? relatedJoin.as : relatedJoinThrough!.as;
                        transformed[targetAlias][operation.as] = parsedValue;
                    } else {
                        // Fallback: add at top level
                        transformed[operation.as] = parsedValue;
                    }
                } else {
                    // Add at top level
                    transformed[operation.as] = parsedValue;
                }
            } else if (operation instanceof Join) {
                // Handle one-to-one joins: group prefixed columns into nested objects
                const prefix = `${operation.as}__`;
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
                if (operation.localField.includes('.')) {
                    const [tableAlias] = operation.localField.split('.');
                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);

                    // Helper function to find nested object by alias and return both the object and its parent path
                    const findNestedObject = (obj: any, alias: string, path: string[] = []): { obj: any, path: string[] } | null => {
                        if (obj[alias] !== undefined && obj[alias] !== null) {
                            return { obj: obj[alias], path: [...path, alias] };
                        }
                        for (const key in obj) {
                            if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                                const found = findNestedObject(obj[key], alias, [...path, key]);
                                if (found !== null) {
                                    return found;
                                }
                            }
                        }
                        return null;
                    };

                    // Find where the related join/joinThrough is nested
                    let targetObject: any = null;
                    if (relatedJoin) {
                        // First check top level
                        if (transformed[relatedJoin.as] !== undefined && transformed[relatedJoin.as] !== null) {
                            targetObject = transformed[relatedJoin.as];
                        } else {
                            // Search for nested Join
                            const found = findNestedObject(transformed, relatedJoin.as);
                            if (found !== null && found.obj !== undefined && found.obj !== null) {
                                targetObject = found.obj;
                            }
                        }
                    } else if (relatedJoinThrough) {
                        // Search for the JoinThrough result in nested structure
                        const found = findNestedObject(transformed, relatedJoinThrough.as);
                        if (found !== null && found.obj !== undefined && found.obj !== null) {
                            targetObject = found.obj;
                        }
                    }

                    if (targetObject) {
                        // Nest under the related join's alias (e.g., agent.person or school.district)
                        // Only nest if there's data, otherwise leave it null/undefined
                        if (hasAnyData) {
                            targetObject[operation.as] = joinedData;
                        } else {
                            targetObject[operation.as] = null;
                        }
                    } else {
                        // Fallback: add at top level
                        transformed[operation.as] = hasAnyData ? joinedData : null;
                    }
                } else {
                    // Add at top level
                    transformed[operation.as] = hasAnyData ? joinedData : null;
                }
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

        // Handle join-through-many operations (JoinThroughMany): parse JSON arrays
        // If localField references a joined table (e.g., "person._id"), nest under that join's alias
        // Track which joins replace others
        const replacedJoins = new Map<string, string>(); // Map from original alias to replacing alias
        for (const joinThroughMany of joinThroughManyOperations) {
            if (joinThroughMany.localField.includes('.')) {
                const [tableAlias] = joinThroughMany.localField.split('.');
                const referencedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);
                const referencedJoinMany = joinManyOperations.find(j => j.as === tableAlias);
                const referencedJoin = referencedJoinThroughMany || referencedJoinMany;
                if (referencedJoin) {
                    const referencedIndex = operations.indexOf(referencedJoin);
                    const currentIndex = operations.indexOf(joinThroughMany);
                    if (referencedIndex < currentIndex) {
                        replacedJoins.set(tableAlias, joinThroughMany.as);
                    }
                }
            }
        }

        // Also check JoinMany operations that might replace other joins
        for (const joinMany of joinManyOperations) {
            if (joinMany.localField.includes('.')) {
                const [tableAlias] = joinMany.localField.split('.');
                const referencedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);
                const referencedJoinMany = joinManyOperations.find(j => j.as === tableAlias);
                const referencedJoin = referencedJoinThroughMany || referencedJoinMany;
                if (referencedJoin) {
                    const referencedIndex = operations.indexOf(referencedJoin);
                    const currentIndex = operations.indexOf(joinMany);
                    if (referencedIndex < currentIndex) {
                        replacedJoins.set(tableAlias, joinMany.as);
                    }
                }
            }
        }

        for (const joinThroughMany of joinThroughManyOperations) {
            // Check if this join is replaced by another - if so, skip it (it's already handled)
            if (replacedJoins.has(joinThroughMany.as)) {
                continue;
            }

            // Check if this join replaces another - if so, use the original alias name
            const originalAlias = Array.from(replacedJoins.entries()).find(([_, replacing]) => replacing === joinThroughMany.as)?.[0];
            const aliasToUse = originalAlias || joinThroughMany.as;

            const jsonValue = row[aliasToUse];
            let parsedValue: any;

            if (jsonValue !== null && jsonValue !== undefined) {
                // Parse JSON if it's a string, otherwise use as-is
                parsedValue = typeof jsonValue === 'string'
                    ? JSON.parse(jsonValue)
                    : jsonValue;
            } else {
                parsedValue = [];
            }

            // Check if this JoinThroughMany references a joined table
            if (joinThroughMany.localField.includes('.')) {
                const [tableAlias] = joinThroughMany.localField.split('.');
                const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);
                const relatedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);
                const relatedJoinMany = joinManyOperations.find(j => j.as === tableAlias);

                if ((relatedJoin && transformed[relatedJoin.as]) ||
                    (relatedJoinThrough && transformed[relatedJoinThrough.as]) ||
                    (relatedJoinThroughMany && transformed[relatedJoinThroughMany.as]) ||
                    (relatedJoinMany && transformed[relatedJoinMany.as])) {
                    // Check if this is replacing the referenced join (e.g., policy_agents replaces policies)
                    const targetAlias = relatedJoin ? relatedJoin.as :
                        (relatedJoinThrough ? relatedJoinThrough.as :
                            (relatedJoinThroughMany ? relatedJoinThroughMany.as : relatedJoinMany!.as));

                    // If this join replaces the target, replace it in the transformed object
                    if (replacedJoins.get(targetAlias) === joinThroughMany.as) {
                        // This is an enriched version that replaces the original
                        transformed[targetAlias] = parsedValue;
                    } else {
                        // Map nested aliases to model field names
                        // e.g., 'policy_agents' nested under 'policies' should be 'agents'
                        let fieldName = joinThroughMany.as;
                        if (fieldName === 'policy_agents' && targetAlias === 'policies') {
                            fieldName = 'agents';
                        }
                        transformed[targetAlias][fieldName] = parsedValue;
                    }
                } else {
                    // Fallback: add at top level
                    transformed[aliasToUse] = parsedValue;
                }
            } else {
                // Add at top level
                transformed[aliasToUse] = parsedValue;
            }
        }

        // Handle JoinMany operations that might replace other joins
        for (const joinMany of joinManyOperations) {
            // Check if this join is replaced by another - if so, skip it (it's already handled)
            if (replacedJoins.has(joinMany.as)) {
                continue;
            }

            // Check if this join replaces another - if so, use the original alias name
            const originalAlias = Array.from(replacedJoins.entries()).find(([_, replacing]) => replacing === joinMany.as)?.[0];
            const aliasToUse = originalAlias || joinMany.as;

            const jsonValue = row[aliasToUse];
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
                const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);
                const relatedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);
                const relatedJoinManyOther = joinManyOperations.find(j => j.as === tableAlias);

                if ((relatedJoin && transformed[relatedJoin.as]) ||
                    (relatedJoinThrough && transformed[relatedJoinThrough.as]) ||
                    (relatedJoinThroughMany && transformed[relatedJoinThroughMany.as]) ||
                    (relatedJoinManyOther && transformed[relatedJoinManyOther.as])) {
                    // Check if this is replacing the referenced join
                    const targetAlias = relatedJoin ? relatedJoin.as :
                        (relatedJoinThrough ? relatedJoinThrough.as :
                            (relatedJoinThroughMany ? relatedJoinThroughMany.as : relatedJoinManyOther!.as));

                    // If this join replaces the target, replace it in the transformed object
                    if (replacedJoins.get(targetAlias) === joinMany.as) {
                        // This is an enriched version that replaces the original
                        transformed[targetAlias] = parsedValue;
                    } else {
                        // Normal nesting
                        transformed[targetAlias][joinMany.as] = parsedValue;
                    }
                } else {
                    // Fallback: add at top level
                    transformed[aliasToUse] = parsedValue;
                }
            } else {
                // Add at top level
                transformed[aliasToUse] = parsedValue;
            }
        }

        return transformed as T;
    });
}


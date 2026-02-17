import { Operation } from '../../operations/operation.js';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { JoinThroughMany } from '../../operations/join-through-many.operation.js';

/**
 * Finds a nested object in the transformed result by alias.
 * Used to locate where nested joins should be placed.
 */
function findNestedObject(obj: any, alias: string, path: string[] = []): { obj: any; path: string[] } | null {
    if (obj[alias] !== undefined && obj[alias] !== null) {
        return { obj: obj[alias], path: [...path, alias] };
    }
    for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
            const found = findNestedObject(obj[key], alias, [...path, key]);
            if (found !== null) {
                return found;
            }
        } else if (Array.isArray(obj[key])) {
            // Also search in arrays
            for (const item of obj[key]) {
                if (item && typeof item === 'object') {
                    const found = findNestedObject(item, alias, [...path, key]);
                    if (found !== null) {
                        return found;
                    }
                }
            }
        }
    }
    return null;
}

/**
 * Parses a JSON value (string or already parsed) into an object or array.
 */
function parseJsonValue(value: any): any {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}

/**
 * Checks if an operation enriches another array join.
 */
function findEnrichmentTarget(
    operation: JoinMany | JoinThroughMany,
    operations: Operation[]
): JoinMany | JoinThroughMany | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias] = operation.localField.split('.');
    const target = operations.find(op =>
        (op instanceof JoinMany || op instanceof JoinThroughMany) && op.as === alias
    ) as JoinMany | JoinThroughMany | undefined;

    if (target && operations.indexOf(target) < operations.indexOf(operation)) {
        return target;
    }

    return null;
}

/**
 * Maps enrichment field names to expected model field names.
 * Special case: policy_agents -> agents when nested under policies/client_policies.
 */
function mapEnrichmentFieldName(fieldName: string, targetAlias: string): string {
    if (fieldName === 'policy_agents' && (targetAlias === 'client_policies' || targetAlias === 'policies')) {
        return 'agents';
    }
    return fieldName;
}

/**
 * Transforms PostgreSQL JOIN results with prefixed columns into nested objects.
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
    if (
        joinOperations.length === 0 &&
        joinManyOperations.length === 0 &&
        joinThroughOperations.length === 0 &&
        joinThroughManyOperations.length === 0
    ) {
        return rows as T[];
    }

    // Collect all join aliases
    const allJoinAliases = [
        ...joinOperations.map(j => j.as),
        ...joinManyOperations.map(j => j.as),
        ...joinThroughOperations.map(j => j.as),
        ...joinThroughManyOperations.map(j => j.as)
    ];

    // Build enrichment map: which operations enrich which targets
    const enrichmentMap = new Map<JoinMany | JoinThroughMany, JoinMany | JoinThroughMany>();
    for (const op of [...joinManyOperations, ...joinThroughManyOperations]) {
        const target = findEnrichmentTarget(op, operations);
        if (target) {
            enrichmentMap.set(op, target);
        }
    }

    return rows.map(row => {
        const transformed: any = {};
        const joinData: any = {};

        // Copy main table columns (those without join prefix or alias)
        for (const key of Object.keys(row)) {
            const hasJoinPrefix = joinOperations.some(join => key.startsWith(`${join.as}__`));
            const isJoinAlias = allJoinAliases.includes(key);

            if (!hasJoinPrefix && !isJoinAlias) {
                transformed[key] = row[key];
            }
        }

        // Process operations in order to handle dependencies
        for (const operation of operations) {
            // Skip enrichment operations - they're already embedded in their targets
            if (enrichmentMap.has(operation as JoinMany | JoinThroughMany)) {
                continue;
            }

            if (operation instanceof Join) {
                // One-to-one join: group prefixed columns into nested object
                const prefix = `${operation.as}__`;
                const joinedData: any = {};
                let hasAnyData = false;

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

                // Determine where to place this join result
                if (operation.localField.includes('.')) {
                    // Nested join: place under referenced join's alias in _joinData
                    const [tableAlias] = operation.localField.split('.');
                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    // First check in joinData
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
                    } else if (relatedJoinThrough && joinData[relatedJoinThrough.as]) {
                        targetObject = joinData[relatedJoinThrough.as];
                    } else {
                        // Search for nested object (could be nested under another join)
                        const found = findNestedObject(joinData, tableAlias);
                        if (found) {
                            targetObject = found.obj;
                        }
                    }

                    if (targetObject) {
                        targetObject[operation.as] = hasAnyData ? joinedData : null;
                    } else {
                        joinData[operation.as] = hasAnyData ? joinedData : null;
                    }
                } else {
                    // Top-level join - place in _joinData
                    joinData[operation.as] = hasAnyData ? joinedData : null;
                }

            } else if (operation instanceof JoinThrough) {
                // Single object join through join table
                const jsonValue = parseJsonValue(row[operation.as]);

                if (operation.localField.includes('.')) {
                    // Nested join
                    const [tableAlias] = operation.localField.split('.');
                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
                    } else if (relatedJoinThrough) {
                        const found = findNestedObject(joinData, relatedJoinThrough.as);
                        if (found) {
                            targetObject = found.obj;
                        }
                    }

                    if (targetObject) {
                        targetObject[operation.as] = jsonValue;
                    } else {
                        joinData[operation.as] = jsonValue;
                    }
                } else {
                    joinData[operation.as] = jsonValue;
                }

            } else if (operation instanceof JoinMany) {
                // Array join (many-to-one)
                const jsonValue = parseJsonValue(row[operation.as]);
                let parsedValue = Array.isArray(jsonValue) ? jsonValue : (jsonValue ? [jsonValue] : []);

                // Process enrichments that are embedded in this array
                const enrichments = Array.from(enrichmentMap.entries())
                    .filter(([_, target]) => target === operation)
                    .map(([enrichOp]) => enrichOp);

                if (enrichments.length > 0 && Array.isArray(parsedValue)) {
                    // The enrichments are already embedded in the SQL result
                    // We just need to map field names if needed
                    for (const item of parsedValue) {
                        if (item && typeof item === 'object') {
                            for (const enrichment of enrichments) {
                                if (item[enrichment.as] !== undefined) {
                                    const mappedName = mapEnrichmentFieldName(enrichment.as, operation.as);
                                    if (mappedName !== enrichment.as) {
                                        item[mappedName] = item[enrichment.as];
                                        delete item[enrichment.as];
                                    }
                                }
                            }
                        }
                    }
                }

                if (operation.localField.includes('.')) {
                    // Nested join: reference to another join's alias
                    const [tableAlias] = operation.localField.split('.');

                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinMany = joinManyOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);
                    const relatedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
                    } else if (relatedJoinThrough) {
                        const found = findNestedObject(joinData, relatedJoinThrough.as);
                        if (found) {
                            targetObject = found.obj;
                        }
                    } else if (relatedJoinMany && joinData[relatedJoinMany.as]) {
                        targetObject = joinData[relatedJoinMany.as];
                    } else if (relatedJoinThroughMany && joinData[relatedJoinThroughMany.as]) {
                        targetObject = joinData[relatedJoinThroughMany.as];
                    }

                    if (targetObject) {
                        targetObject[operation.as] = parsedValue;
                    } else {
                        joinData[operation.as] = parsedValue;
                    }
                } else {
                    joinData[operation.as] = parsedValue;
                }

            } else if (operation instanceof JoinThroughMany) {
                // Array join through join table (many-to-many)
                const jsonValue = parseJsonValue(row[operation.as]);
                let parsedValue = Array.isArray(jsonValue) ? jsonValue : (jsonValue ? [jsonValue] : []);

                // Process enrichments that are embedded in this array
                const enrichments = Array.from(enrichmentMap.entries())
                    .filter(([_, target]) => target === operation)
                    .map(([enrichOp]) => enrichOp);

                if (enrichments.length > 0 && Array.isArray(parsedValue)) {
                    // The enrichments are already embedded in the SQL result
                    // We just need to map field names if needed
                    for (const item of parsedValue) {
                        if (item && typeof item === 'object') {
                            for (const enrichment of enrichments) {
                                if (item[enrichment.as] !== undefined) {
                                    const mappedName = mapEnrichmentFieldName(enrichment.as, operation.as);
                                    if (mappedName !== enrichment.as) {
                                        item[mappedName] = item[enrichment.as];
                                        delete item[enrichment.as];
                                    }
                                }
                            }
                        }
                    }
                }

                if (operation.localField.includes('.')) {
                    // Nested join: reference to another join's alias
                    const [tableAlias] = operation.localField.split('.');

                    const relatedJoin = joinOperations.find(j => j.as === tableAlias);
                    const relatedJoinMany = joinManyOperations.find(j => j.as === tableAlias);
                    const relatedJoinThrough = joinThroughOperations.find(j => j.as === tableAlias);
                    const relatedJoinThroughMany = joinThroughManyOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
                    } else if (relatedJoinThrough) {
                        const found = findNestedObject(joinData, relatedJoinThrough.as);
                        if (found) {
                            targetObject = found.obj;
                        }
                    } else if (relatedJoinMany && joinData[relatedJoinMany.as]) {
                        targetObject = joinData[relatedJoinMany.as];
                    } else if (relatedJoinThroughMany && joinData[relatedJoinThroughMany.as]) {
                        targetObject = joinData[relatedJoinThroughMany.as];
                    }

                    if (targetObject) {
                        targetObject[operation.as] = parsedValue;
                    } else {
                        joinData[operation.as] = parsedValue;
                    }
                } else {
                    joinData[operation.as] = parsedValue;
                }
            }
        }

        // Add _joinData if there's any join data
        if (Object.keys(joinData).length > 0) {
            transformed._joinData = joinData;
        }

        return transformed as T;
    });
}

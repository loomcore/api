import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';

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
    operation: LeftJoinMany,
    operations: Operation[]
): LeftJoinMany | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias] = operation.localField.split('.');
    const target = operations.find(op =>
        op instanceof LeftJoinMany && op.as === alias
    ) as LeftJoinMany | undefined;

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
    const leftJoinOperations = operations.filter(op => op instanceof LeftJoin) as LeftJoin[];
    const innerJoinOperations = operations.filter(op => op instanceof InnerJoin) as InnerJoin[];
    const leftJoinManyOperations = operations.filter(op => op instanceof LeftJoinMany) as LeftJoinMany[];
    const allJoinOperations = [...leftJoinOperations, ...innerJoinOperations];

    // If no joins, return rows as-is
    if (
        allJoinOperations.length === 0 &&
        leftJoinManyOperations.length === 0
    ) {
        return rows as T[];
    }

    // Collect all join aliases
    const allJoinAliases = [
        ...allJoinOperations.map(j => j.as),
        ...leftJoinManyOperations.map(j => j.as)
    ];

    // Build enrichment map: which operations enrich which targets
    const enrichmentMap = new Map<LeftJoinMany, LeftJoinMany>();
    for (const op of leftJoinManyOperations) {
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
            const hasJoinPrefix = allJoinOperations.some(join => key.startsWith(`${join.as}__`));
            const isJoinAlias = allJoinAliases.includes(key);

            if (!hasJoinPrefix && !isJoinAlias) {
                transformed[key] = row[key];
            }
        }

        // Process operations in order to handle dependencies
        for (const operation of operations) {
            // Skip enrichment operations - they're already embedded in their targets
            if (enrichmentMap.has(operation as LeftJoinMany)) {
                continue;
            }

            if (operation instanceof LeftJoin || operation instanceof InnerJoin) {
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
                    const relatedJoin = allJoinOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    // First check in joinData
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
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

            } else if (operation instanceof LeftJoinMany) {
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

                    const relatedJoin = allJoinOperations.find(j => j.as === tableAlias);
                    const relatedJoinMany = leftJoinManyOperations.find(j => j.as === tableAlias);

                    let targetObject: any = null;
                    if (relatedJoin && joinData[relatedJoin.as]) {
                        targetObject = joinData[relatedJoin.as];
                    } else if (relatedJoinMany && joinData[relatedJoinMany.as]) {
                        targetObject = joinData[relatedJoinMany.as];
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

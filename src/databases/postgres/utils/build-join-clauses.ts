import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";
import { JoinThroughMany } from "../../operations/join-through-many.operation.js";

/**
 * Resolves a local field reference to a SQL expression.
 * Handles:
 * - Direct main table references: "field" -> "mainTable"."field"
 * - Joined table references: "alias.field" -> "alias"."field"
 * - JSON object references: "alias.field" where alias is a JoinThrough -> extract from JSON object
 * - JSON array references: "alias.field" where alias is a JoinMany/JoinThroughMany -> extract from JSON array
 */
function resolveLocalField(
    localField: string,
    mainTableName: string | undefined,
    operations: Operation[]
): string {
    if (!localField.includes('.')) {
        // Direct reference to main table
        return mainTableName
            ? `"${mainTableName}"."${localField}"`
            : `"${localField}"`;
    }

    // Reference to a joined table: "alias.field"
    const [alias, field] = localField.split('.');

    // Check if this alias refers to a JSON object join (JoinThrough)
    const objectJoin = operations.find(op =>
        op instanceof JoinThrough && op.as === alias
    );

    if (objectJoin) {
        // Extract from JSON object: (alias.aggregated->>'field')::integer
        return `(${alias}.aggregated->>'${field}')::integer`;
    }

    // Check if this alias refers to a JSON array join (JoinMany or JoinThroughMany)
    const arrayJoin = operations.find(op =>
        (op instanceof JoinMany || op instanceof JoinThroughMany) && op.as === alias
    );

    if (arrayJoin) {
        // Extract from JSON array: (alias.aggregated->>'field')::integer
        return `(${alias}.aggregated->>'${field}')::integer`;
    }

    // Regular table alias reference
    return `${alias}."${field}"`;
}

/**
 * Checks if an operation enriches another array join.
 * An operation enriches another if:
 * - It's a JoinMany or JoinThroughMany
 * - Its localField references another JoinMany or JoinThroughMany's alias
 * - The referenced join appears earlier in the operations array
 */
function findEnrichmentTarget(
    operation: JoinMany | JoinThroughMany,
    operations: Operation[]
): { target: JoinMany | JoinThroughMany; field: string } | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias, field] = operation.localField.split('.');
    const target = operations.find(op =>
        (op instanceof JoinMany || op instanceof JoinThroughMany) && op.as === alias
    ) as JoinMany | JoinThroughMany | undefined;

    if (target && operations.indexOf(target) < operations.indexOf(operation)) {
        return { target, field };
    }

    return null;
}

/**
 * Builds SQL JOIN clauses for all join operations.
 * Handles enrichment: when a join references an array join, it enriches that array.
 * Handles chained enrichments: multiple enrichments of the same target are chained together.
 */
export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const processedAliases = new Set<string>();
    const enrichedAliases = new Set<string>(); // Track aliases that have been enriched

    // Get all Join operations for nested enrichment detection
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];

    // First pass: identify which targets will be enriched and collect all enrichments per target
    const targetsToEnrich = new Set<string>();
    const enrichmentsByTarget = new Map<string, Array<{ operation: JoinMany | JoinThroughMany; field: string }>>();

    for (const operation of operations) {
        if (operation instanceof JoinMany || operation instanceof JoinThroughMany) {
            const enrichment = findEnrichmentTarget(operation, operations);
            if (enrichment) {
                const { target } = enrichment;
                targetsToEnrich.add(target.as);

                if (!enrichmentsByTarget.has(target.as)) {
                    enrichmentsByTarget.set(target.as, []);
                }
                enrichmentsByTarget.get(target.as)!.push({ operation, field: enrichment.field });
            }
        }
    }

    // Sort enrichments by their order in the operations array
    for (const [targetAlias, enrichments] of enrichmentsByTarget.entries()) {
        enrichments.sort((a, b) => operations.indexOf(a.operation) - operations.indexOf(b.operation));
    }

    for (const operation of operations) {
        // Skip if already processed
        if (processedAliases.has(operation.as)) {
            continue;
        }

        // Skip targets that will be enriched (they'll be created as enriched versions when we process the first enrichment)
        // But don't skip enrichment operations themselves - we need to process them to create the enriched join
        const isEnrichmentOp = (operation instanceof JoinMany || operation instanceof JoinThroughMany) &&
            findEnrichmentTarget(operation, operations) !== null;
        if (targetsToEnrich.has(operation.as) && !isEnrichmentOp) {
            continue;
        }

        if (operation instanceof Join) {
            // One-to-one join: LEFT JOIN table AS alias ON ...
            const localFieldRef = resolveLocalField(operation.localField, mainTableName, operations);
            joinClauses += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localFieldRef} = "${operation.as}"."${operation.foreignField}"`;
            processedAliases.add(operation.as);

        } else if (operation instanceof JoinMany) {
            const enrichment = findEnrichmentTarget(operation, operations);

            if (enrichment) {
                // Check if this is the first enrichment for this target
                const enrichments = enrichmentsByTarget.get(enrichment.target.as)!;
                const isFirstEnrichment = enrichments[0].operation === operation;

                if (isFirstEnrichment && !enrichedAliases.has(enrichment.target.as)) {
                    // First enrichment: create the enriched join
                    const { target, field } = enrichment;

                    // Get the original target's local field reference
                    const targetLocalFieldRef = target.localField.includes('.')
                        ? resolveLocalField(target.localField, mainTableName, operations)
                        : (mainTableName ? `"${mainTableName}"."${target.localField}"` : `"${target.localField}"`);

                    // Build enriched join with all enrichments chained together
                    let enrichmentJoins = '';
                    let jsonBuildObjects = '';

                    for (const enrich of enrichments) {
                        const enrichField = enrich.field;
                        const enrichOp = enrich.operation;
                        const enrichAlias = `enrich_${enrichOp.as}`;

                        // Check if we need to enrich the enrichment (e.g., agents -> persons)
                        // Look for joins that reference the same table as the enrichment's from table
                        // For example: if enriching with 'agents' table, look for joins that reference 'agent.person_id'
                        const nestedJoin = joinOperations.find((j: Join) => {
                            if (!j.localField.includes('.')) return false;
                            const [referencedAlias] = j.localField.split('.');
                            // Find the join operation that has this alias and check if it references the same table
                            const referencedJoin = operations.find(op =>
                                (op instanceof Join || op instanceof JoinMany || op instanceof JoinThroughMany) &&
                                op.as === referencedAlias
                            );
                            // Check if the referenced join's table matches the enrichment's table
                            if (referencedJoin instanceof Join && referencedJoin.from === enrichOp.from) {
                                return true;
                            }
                            // Also check if enrichOp is JoinThroughMany and the referenced join matches its from table
                            if (enrichOp instanceof JoinThroughMany && referencedJoin instanceof Join && referencedJoin.from === enrichOp.from) {
                                return true;
                            }
                            return false;
                        });

                        if (nestedJoin) {
                            // Enrich each element in the enrichment with the nested join
                            const nestedField = nestedJoin.localField.split('.')[1];
                            enrichmentJoins += ` LEFT JOIN LATERAL (
                                SELECT COALESCE(
                                    JSON_AGG(
                                        enrich_elem.value || jsonb_build_object('${nestedJoin.as}', nested_join_data.${nestedJoin.as})
                                    ),
                                    '[]'::json
                                ) AS enriched
                                FROM (
                                    SELECT COALESCE(JSON_AGG(row_to_json(enrich_table)), '[]'::json) AS enriched
                                    FROM "${enrichOp.from}" AS enrich_table
                                    WHERE enrich_table."${enrichOp.foreignField}" = (elem.value->>'${enrichField}')::integer
                                    AND enrich_table."_deleted" IS NULL
                                ) AS enrich_data
                                CROSS JOIN LATERAL jsonb_array_elements(enrich_data.enriched::jsonb) AS enrich_elem
                                LEFT JOIN LATERAL (
                                    SELECT row_to_json(nested_table) AS ${nestedJoin.as}
                                    FROM "${nestedJoin.from}" AS nested_table
                                    WHERE nested_table."${nestedJoin.foreignField}" = (enrich_elem.value->>'${nestedField}')::integer
                                    AND nested_table."_deleted" IS NULL
                                    LIMIT 1
                                ) AS nested_join_data ON true
                            ) AS ${enrichAlias} ON true`;
                        } else {
                            enrichmentJoins += ` LEFT JOIN LATERAL (
                                SELECT COALESCE(JSON_AGG(row_to_json(enrich_table)), '[]'::json) AS enriched
                                FROM "${enrichOp.from}" AS enrich_table
                                WHERE enrich_table."${enrichOp.foreignField}" = (elem.value->>'${enrichField}')::integer
                                AND enrich_table."_deleted" IS NULL
                            ) AS ${enrichAlias} ON true`;
                        }

                        jsonBuildObjects += ` || jsonb_build_object('${enrichOp.as}', COALESCE(${enrichAlias}.enriched, '[]'::json))`;
                    }

                    joinClauses += ` LEFT JOIN LATERAL (
                        SELECT COALESCE(
                            JSON_AGG(
                                elem.value${jsonBuildObjects}
                            ),
                            '[]'::json
                        ) AS aggregated
                        FROM (
                            SELECT COALESCE(JSON_AGG(row_to_json(target_table)), '[]'::json) AS aggregated
                            FROM "${target.from}" AS target_table
                            WHERE target_table."${target.foreignField}" = ${targetLocalFieldRef}
                            AND target_table."_deleted" IS NULL
                        ) AS original_data
                        CROSS JOIN LATERAL jsonb_array_elements(original_data.aggregated::jsonb) AS elem${enrichmentJoins}
                    ) AS ${target.as} ON true`;

                    enrichedAliases.add(target.as);
                    processedAliases.add(target.as);

                    // Mark all enrichment operations as processed
                    for (const enrich of enrichments) {
                        processedAliases.add(enrich.operation.as);
                    }
                }
                // If not first enrichment, it's already handled above
            } else {
                // Regular many-to-one join
                const localFieldRef = resolveLocalField(operation.localField, mainTableName, operations);

                joinClauses += ` LEFT JOIN LATERAL (
                    SELECT COALESCE(JSON_AGG(row_to_json("${operation.from}")), '[]'::json) AS aggregated
                    FROM "${operation.from}"
                    WHERE "${operation.from}"."${operation.foreignField}" = ${localFieldRef}
                    AND "${operation.from}"."_deleted" IS NULL
                ) AS ${operation.as} ON true`;
                processedAliases.add(operation.as);
            }

        } else if (operation instanceof JoinThrough) {
            // One-to-one through join table
            const localFieldRef = resolveLocalField(operation.localField, mainTableName, operations);

            joinClauses += ` LEFT JOIN LATERAL (
                SELECT row_to_json(${operation.as}) AS aggregated
                FROM "${operation.through}"
                INNER JOIN "${operation.from}" AS ${operation.as} 
                    ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                WHERE "${operation.through}"."${operation.throughLocalField}" = ${localFieldRef}
                AND "${operation.through}"."_deleted" IS NULL
                AND ${operation.as}."_deleted" IS NULL
                LIMIT 1
            ) AS ${operation.as} ON true`;
            processedAliases.add(operation.as);

        } else if (operation instanceof JoinThroughMany) {
            const enrichment = findEnrichmentTarget(operation, operations);

            if (enrichment) {
                // Check if this is the first enrichment for this target
                const enrichments = enrichmentsByTarget.get(enrichment.target.as)!;
                const isFirstEnrichment = enrichments[0].operation === operation;

                if (isFirstEnrichment && !enrichedAliases.has(enrichment.target.as)) {
                    // First enrichment: create the enriched join
                    const { target, field } = enrichment;

                    // Get the original target's local field reference
                    const targetLocalFieldRef = target.localField.includes('.')
                        ? resolveLocalField(target.localField, mainTableName, operations)
                        : (mainTableName ? `"${mainTableName}"."${target.localField}"` : `"${target.localField}"`);

                    // Determine if target is JoinMany or JoinThroughMany
                    const isTargetJoinMany = target instanceof JoinMany;

                    // Build enriched join with all enrichments chained together
                    let enrichmentJoins = '';
                    let jsonBuildObjects = '';

                    for (const enrich of enrichments) {
                        const enrichField = enrich.field;
                        const enrichOp = enrich.operation;
                        const enrichAlias = `enrich_${enrichOp.as}`;

                        if (enrichOp instanceof JoinMany) {
                            // Check if we need to enrich the enrichment (e.g., agents -> persons)
                            const nestedJoin = joinOperations.find(j =>
                                j.localField.includes('.') &&
                                j.localField.startsWith(`${enrichOp.as}.`)
                            );

                            if (nestedJoin) {
                                // Enrich each element in the enrichment with the nested join
                                const nestedField = nestedJoin.localField.split('.')[1];
                                enrichmentJoins += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                            enrich_elem.value || jsonb_build_object('${nestedJoin.as}', nested_join_data.${nestedJoin.as})
                                        ),
                                        '[]'::json
                                    ) AS enriched
                                    FROM (
                                        SELECT COALESCE(JSON_AGG(row_to_json(enrich_table)), '[]'::json) AS enriched
                                        FROM "${enrichOp.from}" AS enrich_table
                                        WHERE enrich_table."${enrichOp.foreignField}" = (elem.value->>'${enrichField}')::integer
                                        AND enrich_table."_deleted" IS NULL
                                    ) AS enrich_data
                                    CROSS JOIN LATERAL jsonb_array_elements(enrich_data.enriched::jsonb) AS enrich_elem
                                    LEFT JOIN LATERAL (
                                        SELECT row_to_json(nested_table) AS ${nestedJoin.as}
                                        FROM "${nestedJoin.from}" AS nested_table
                                        WHERE nested_table."${nestedJoin.foreignField}" = (enrich_elem.value->>'${nestedField}')::integer
                                        AND nested_table."_deleted" IS NULL
                                        LIMIT 1
                                    ) AS nested_join_data ON true
                                ) AS ${enrichAlias} ON true`;
                            } else {
                                enrichmentJoins += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(JSON_AGG(row_to_json(enrich_table)), '[]'::json) AS enriched
                                    FROM "${enrichOp.from}" AS enrich_table
                                    WHERE enrich_table."${enrichOp.foreignField}" = (elem.value->>'${enrichField}')::integer
                                    AND enrich_table."_deleted" IS NULL
                                ) AS ${enrichAlias} ON true`;
                            }
                        } else {
                            // JoinThroughMany
                            // Check if we need to enrich the enrichment (e.g., agents -> persons)
                            // Look for joins that reference the same table as the enrichment's from table
                            const nestedJoin = joinOperations.find((j: Join) => {
                                if (!j.localField.includes('.')) return false;
                                const [referencedAlias] = j.localField.split('.');
                                // Find the join operation that has this alias and check if it references the same table
                                const referencedJoin = operations.find(op =>
                                    (op instanceof Join || op instanceof JoinMany || op instanceof JoinThroughMany) &&
                                    op.as === referencedAlias
                                );
                                // Check if the referenced join's table matches the enrichment's table
                                if (referencedJoin instanceof Join && referencedJoin.from === enrichOp.from) {
                                    return true;
                                }
                                // Also check if enrichOp is JoinThroughMany and the referenced join matches its from table
                                if (enrichOp instanceof JoinThroughMany && referencedJoin instanceof Join && referencedJoin.from === enrichOp.from) {
                                    return true;
                                }
                                return false;
                            });

                            if (nestedJoin) {
                                // Enrich each element in the enrichment with the nested join
                                const nestedField = nestedJoin.localField.split('.')[1];
                                enrichmentJoins += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                            enrich_elem.value || jsonb_build_object('${nestedJoin.as}', nested_join_data.${nestedJoin.as})
                                        ),
                                        '[]'::json
                                    ) AS enriched
                                    FROM (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${enrichAlias}_table)), '[]'::json) AS enriched
                                        FROM "${enrichOp.through}"
                                        INNER JOIN "${enrichOp.from}" AS ${enrichAlias}_table 
                                            ON ${enrichAlias}_table."${enrichOp.foreignField}" = "${enrichOp.through}"."${enrichOp.throughForeignField}"
                                        WHERE "${enrichOp.through}"."${enrichOp.throughLocalField}" = (elem.value->>'${enrichField}')::integer
                                        AND "${enrichOp.through}"."_deleted" IS NULL
                                        AND ${enrichAlias}_table."_deleted" IS NULL
                                    ) AS enrich_data
                                    CROSS JOIN LATERAL jsonb_array_elements(enrich_data.enriched::jsonb) AS enrich_elem
                                    LEFT JOIN LATERAL (
                                        SELECT row_to_json(nested_table) AS ${nestedJoin.as}
                                        FROM "${nestedJoin.from}" AS nested_table
                                        WHERE nested_table."${nestedJoin.foreignField}" = (enrich_elem.value->>'${nestedField}')::integer
                                        AND nested_table."_deleted" IS NULL
                                        LIMIT 1
                                    ) AS nested_join_data ON true
                                ) AS ${enrichAlias} ON true`;
                            } else {
                                enrichmentJoins += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(JSON_AGG(row_to_json(${enrichAlias}_table)), '[]'::json) AS enriched
                                    FROM "${enrichOp.through}"
                                    INNER JOIN "${enrichOp.from}" AS ${enrichAlias}_table 
                                        ON ${enrichAlias}_table."${enrichOp.foreignField}" = "${enrichOp.through}"."${enrichOp.throughForeignField}"
                                    WHERE "${enrichOp.through}"."${enrichOp.throughLocalField}" = (elem.value->>'${enrichField}')::integer
                                    AND "${enrichOp.through}"."_deleted" IS NULL
                                    AND ${enrichAlias}_table."_deleted" IS NULL
                                ) AS ${enrichAlias} ON true`;
                            }
                        }

                        jsonBuildObjects += ` || jsonb_build_object('${enrichOp.as}', COALESCE(${enrichAlias}.enriched, '[]'::json))`;
                    }

                    if (isTargetJoinMany) {
                        // Target is JoinMany - enrich it
                        joinClauses += ` LEFT JOIN LATERAL (
                            SELECT COALESCE(
                                JSON_AGG(
                                    elem.value${jsonBuildObjects}
                                ),
                                '[]'::json
                            ) AS aggregated
                            FROM (
                                SELECT COALESCE(JSON_AGG(row_to_json(target_table)), '[]'::json) AS aggregated
                                FROM "${target.from}" AS target_table
                                WHERE target_table."${target.foreignField}" = ${targetLocalFieldRef}
                                AND target_table."_deleted" IS NULL
                            ) AS original_data
                            CROSS JOIN LATERAL jsonb_array_elements(original_data.aggregated::jsonb) AS elem${enrichmentJoins}
                        ) AS ${target.as} ON true`;
                    } else {
                        // Target is JoinThroughMany - enrich it
                        const targetThrough = target as JoinThroughMany;
                        joinClauses += ` LEFT JOIN LATERAL (
                            SELECT COALESCE(
                                JSON_AGG(
                                    elem.value${jsonBuildObjects}
                                ),
                                '[]'::json
                            ) AS aggregated
                            FROM (
                                SELECT COALESCE(JSON_AGG(row_to_json(target_table)), '[]'::json) AS aggregated
                                FROM "${targetThrough.through}"
                                INNER JOIN "${targetThrough.from}" AS target_table 
                                    ON target_table."${targetThrough.foreignField}" = "${targetThrough.through}"."${targetThrough.throughForeignField}"
                                WHERE "${targetThrough.through}"."${targetThrough.throughLocalField}" = ${targetLocalFieldRef}
                                AND "${targetThrough.through}"."_deleted" IS NULL
                                AND target_table."_deleted" IS NULL
                            ) AS original_data
                            CROSS JOIN LATERAL jsonb_array_elements(original_data.aggregated::jsonb) AS elem${enrichmentJoins}
                        ) AS ${target.as} ON true`;
                    }

                    enrichedAliases.add(target.as);
                    processedAliases.add(target.as);

                    // Mark all enrichment operations as processed
                    for (const enrich of enrichments) {
                        processedAliases.add(enrich.operation.as);
                    }
                }
                // If not first enrichment, it's already handled above
            } else {
                // Regular many-to-many through join table
                const localFieldRef = resolveLocalField(operation.localField, mainTableName, operations);

                joinClauses += ` LEFT JOIN LATERAL (
                    SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS aggregated
                    FROM "${operation.through}"
                    INNER JOIN "${operation.from}" AS ${operation.as} 
                        ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                    WHERE "${operation.through}"."${operation.throughLocalField}" = ${localFieldRef}
                    AND "${operation.through}"."_deleted" IS NULL
                    AND ${operation.as}."_deleted" IS NULL
                ) AS ${operation.as} ON true`;
                processedAliases.add(operation.as);
            }
        }
    }

    return joinClauses;
}

import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";
import { JoinThroughMany } from "../../operations/join-through-many.operation.js";

export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    const processedAliases = new Set<string>(); // Track which aliases have been created
    const aliasesToSkip = new Set<string>(); // Track aliases that will be replaced/enriched

    // First pass: identify which joins will be enriched/replaced
    for (const operation of operations) {
        if (operation instanceof JoinThroughMany && operation.localField.includes('.')) {
            const [tableAlias] = operation.localField.split('.');
            const referencedJoinThroughMany = operations
                .filter(op => op instanceof JoinThroughMany)
                .find(jtm => jtm.as === tableAlias);
            if (referencedJoinThroughMany) {
                const referencedIndex = operations.indexOf(referencedJoinThroughMany);
                const currentIndex = operations.indexOf(operation);
                if (referencedIndex < currentIndex) {
                    // This join will enrich the referenced one, so skip creating the original
                    aliasesToSkip.add(tableAlias);
                }
            }
        }
    }

    // Process operations in order so dependencies are resolved correctly
    // When a Join references a JoinThrough result, we extract from JSON
    for (const operation of operations) {
        if (operation instanceof Join) {
            // Regular one-to-one joins (LEFT JOIN)
            let localFieldRef: string;
            if (operation.localField.includes('.')) {
                // Reference a joined table alias (e.g., "agent.person_id" or "school.district_id")
                const [tableAlias, columnName] = operation.localField.split('.');

                // Check if this references a JoinThrough result (which is JSON, not a table alias)
                const referencedJoinThrough = joinThroughOperations.find(jt => jt.as === tableAlias);
                if (referencedJoinThrough) {
                    // Extract field from JSON: school.district_id -> (school.aggregated->>'district_id')::integer
                    // Cast to integer since foreign keys are typically integers
                    localFieldRef = `(${tableAlias}.aggregated->>'${columnName}')::integer`;
                } else {
                    // Regular table alias reference
                    localFieldRef = `${tableAlias}."${columnName}"`;
                }
            } else {
                // Reference main table column directly
                localFieldRef = mainTableName
                    ? `"${mainTableName}"."${operation.localField}"`
                    : `"${operation.localField}"`;
            }
            joinClauses += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localFieldRef} = "${operation.as}"."${operation.foreignField}"`;
        } else if (operation instanceof JoinMany) {
            // Many-to-one joins (JoinMany) - use LATERAL LEFT JOIN
            let localFieldRef: string;
            if (operation.localField.includes('.')) {
                // Reference a joined table alias (e.g., "person._id")
                const [tableAlias, columnName] = operation.localField.split('.');
                localFieldRef = `${tableAlias}."${columnName}"`;
            } else {
                // Reference main table column directly
                localFieldRef = mainTableName
                    ? `"${mainTableName}"."${operation.localField}"`
                    : `"${operation.localField}"`;
            }

            // Use LATERAL LEFT JOIN - can reference outer query aliases directly
            joinClauses += ` LEFT JOIN LATERAL (
                SELECT COALESCE(JSON_AGG(row_to_json("${operation.from}")), '[]'::json) AS aggregated
                FROM "${operation.from}"
                WHERE "${operation.from}"."${operation.foreignField}" = ${localFieldRef}
                AND "${operation.from}"."_deleted" IS NULL
            ) AS ${operation.as} ON true`;
        } else if (operation instanceof JoinThrough) {
            // Join-through operations (one-to-one through join table) - use LATERAL LEFT JOIN
            // Returns a single object instead of an array
            let localFieldRef: string;
            if (operation.localField.includes('.')) {
                // Reference a joined table alias (e.g., "person._id")
                const [tableAlias, columnName] = operation.localField.split('.');
                localFieldRef = `${tableAlias}."${columnName}"`;
            } else {
                // Reference main table column directly
                localFieldRef = mainTableName
                    ? `"${mainTableName}"."${operation.localField}"`
                    : `"${operation.localField}"`;
            }

            // Use LATERAL LEFT JOIN - can reference outer query aliases directly
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
        } else if (operation instanceof JoinThroughMany) {
            // Join-through-many operations (many-to-many) - use LATERAL LEFT JOIN
            // Returns an array of objects
            let localFieldRef: string;
            let shouldSkipOriginalJoin = false;

            if (operation.localField.includes('.')) {
                // Reference a joined table alias (e.g., "person._id")
                const [tableAlias, columnName] = operation.localField.split('.');

                // Check if this references a JoinThroughMany result (which is JSON, not a table alias)
                const referencedJoinThroughMany = operations
                    .filter(op => op instanceof JoinThroughMany)
                    .find(jtm => jtm.as === tableAlias);

                if (referencedJoinThroughMany) {
                    // Reference is to a JSON array from another JoinThroughMany (e.g., policies)
                    // Check if the referenced join has already been processed
                    const referencedIndex = operations.indexOf(referencedJoinThroughMany);
                    const currentIndex = operations.indexOf(operation);

                    if (referencedIndex < currentIndex) {
                        // The referenced join will be enriched - create it inline if it wasn't created yet
                        shouldSkipOriginalJoin = true;
                        const originalJoinWasSkipped = aliasesToSkip.has(tableAlias);
                        const originalJoin = referencedJoinThroughMany;
                        const mainTableRef = mainTableName ? `"${mainTableName}"."_id"` : '"_id"';

                        const isAgentsJoin = operation.from === 'agents';
                        if (isAgentsJoin) {
                            // Enrich agents with person data
                            if (originalJoinWasSkipped) {
                                // Create policies join inline and enrich with agents
                                joinClauses += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                        policy_elem.value || jsonb_build_object(
                                            'agents', 
                                            COALESCE(
                                                    (SELECT JSON_AGG(agent_elem.value || jsonb_build_object('agent_person', person_data.value))
                                                     FROM jsonb_array_elements(COALESCE(agents_agg.agents, '[]'::json)::jsonb) AS agent_elem
                                                     LEFT JOIN LATERAL (
                                                         SELECT row_to_json(p) AS value
                                                         FROM "persons" AS p
                                                         WHERE p."_id" = (agent_elem.value->>'person_id')::integer
                                                         AND p."_deleted" IS NULL
                                                         LIMIT 1
                                                     ) AS person_data ON true),
                                                    '[]'::json
                                                )
                                            )
                                        ),
                                        '[]'::json
                                    ) AS aggregated
                                    FROM (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${tableAlias})), '[]'::json) AS aggregated
                                        FROM "${originalJoin.through}"
                                        INNER JOIN "${originalJoin.from}" AS ${tableAlias} 
                                            ON ${tableAlias}."${originalJoin.foreignField}" = "${originalJoin.through}"."${originalJoin.throughForeignField}"
                                        WHERE "${originalJoin.through}"."${originalJoin.throughLocalField}" = ${mainTableRef}
                                        AND "${originalJoin.through}"."_deleted" IS NULL
                                        AND ${tableAlias}."_deleted" IS NULL
                                    ) AS policies_subquery
                                    CROSS JOIN LATERAL jsonb_array_elements(policies_subquery.aggregated::jsonb) AS policy_elem
                                    LEFT JOIN LATERAL (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS agents
                                        FROM "${operation.through}"
                                        INNER JOIN "${operation.from}" AS ${operation.as} 
                                            ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                                        WHERE "${operation.through}"."${operation.throughLocalField}" = (policy_elem.value->>'${columnName}')::integer
                                        AND "${operation.through}"."_deleted" IS NULL
                                        AND ${operation.as}."_deleted" IS NULL
                                    ) AS agents_agg ON true
                                ) AS ${operation.as} ON true`;
                            } else {
                                // Use existing policies join and enrich with agents
                                joinClauses += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                        policy_elem.value || jsonb_build_object(
                                            'agents', 
                                            COALESCE(
                                                    (SELECT JSON_AGG(agent_elem.value || jsonb_build_object('agent_person', person_data.value))
                                                     FROM jsonb_array_elements(COALESCE(agents_agg.agents, '[]'::json)::jsonb) AS agent_elem
                                                     LEFT JOIN LATERAL (
                                                         SELECT row_to_json(p) AS value
                                                         FROM "persons" AS p
                                                         WHERE p."_id" = (agent_elem.value->>'person_id')::integer
                                                         AND p."_deleted" IS NULL
                                                         LIMIT 1
                                                     ) AS person_data ON true),
                                                    '[]'::json
                                                )
                                            )
                                        ),
                                        '[]'::json
                                    ) AS aggregated
                                    FROM jsonb_array_elements(COALESCE(${tableAlias}.aggregated, '[]'::json)::jsonb) AS policy_elem
                                    LEFT JOIN LATERAL (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS agents
                                        FROM "${operation.through}"
                                        INNER JOIN "${operation.from}" AS ${operation.as} 
                                            ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                                        WHERE "${operation.through}"."${operation.throughLocalField}" = (policy_elem.value->>'${columnName}')::integer
                                        AND "${operation.through}"."_deleted" IS NULL
                                        AND ${operation.as}."_deleted" IS NULL
                                    ) AS agents_agg ON true
                                ) AS ${operation.as} ON true`;
                            }
                        } else {
                            // Regular nested join, no person enrichment needed
                            if (originalJoinWasSkipped) {
                                // Create policies join inline and enrich with nested data
                                joinClauses += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                            policy_elem.value || jsonb_build_object('agents', COALESCE(agents_agg.agents, '[]'::json))
                                        ),
                                        '[]'::json
                                    ) AS aggregated
                                    FROM (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${tableAlias})), '[]'::json) AS aggregated
                                        FROM "${originalJoin.through}"
                                        INNER JOIN "${originalJoin.from}" AS ${tableAlias} 
                                            ON ${tableAlias}."${originalJoin.foreignField}" = "${originalJoin.through}"."${originalJoin.throughForeignField}"
                                        WHERE "${originalJoin.through}"."${originalJoin.throughLocalField}" = ${mainTableRef}
                                        AND "${originalJoin.through}"."_deleted" IS NULL
                                        AND ${tableAlias}."_deleted" IS NULL
                                    ) AS policies_subquery
                                    CROSS JOIN LATERAL jsonb_array_elements(policies_subquery.aggregated::jsonb) AS policy_elem
                                    LEFT JOIN LATERAL (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS agents
                                        FROM "${operation.through}"
                                        INNER JOIN "${operation.from}" AS ${operation.as} 
                                            ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                                        WHERE "${operation.through}"."${operation.throughLocalField}" = (policy_elem.value->>'${columnName}')::integer
                                        AND "${operation.through}"."_deleted" IS NULL
                                        AND ${operation.as}."_deleted" IS NULL
                                    ) AS agents_agg ON true
                                ) AS ${operation.as} ON true`;
                            } else {
                                // Use existing policies join and enrich with nested data
                                joinClauses += ` LEFT JOIN LATERAL (
                                    SELECT COALESCE(
                                        JSON_AGG(
                                            policy_elem.value || jsonb_build_object('agents', COALESCE(agents_agg.agents, '[]'::json))
                                        ),
                                        '[]'::json
                                    ) AS aggregated
                                    FROM jsonb_array_elements(COALESCE(${tableAlias}.aggregated, '[]'::json)::jsonb) AS policy_elem
                                    LEFT JOIN LATERAL (
                                        SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS agents
                                        FROM "${operation.through}"
                                        INNER JOIN "${operation.from}" AS ${operation.as} 
                                            ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                                        WHERE "${operation.through}"."${operation.throughLocalField}" = (policy_elem.value->>'${columnName}')::integer
                                        AND "${operation.through}"."_deleted" IS NULL
                                        AND ${operation.as}."_deleted" IS NULL
                                    ) AS agents_agg ON true
                                ) AS ${operation.as} ON true`;
                            }
                        }
                        processedAliases.add(operation.as);
                        continue; // Skip the rest - we've already created the enriched join
                    } else {
                        // The referenced join hasn't been processed yet, treat as regular table alias
                        localFieldRef = `${tableAlias}."${columnName}"`;
                    }
                } else {
                    // Regular table alias reference
                    localFieldRef = `${tableAlias}."${columnName}"`;
                }
            } else {
                // Reference main table column directly
                localFieldRef = mainTableName
                    ? `"${mainTableName}"."${operation.localField}"`
                    : `"${operation.localField}"`;
            }

            // Skip creating the original join if it will be enriched/replaced later
            if (!shouldSkipOriginalJoin && !aliasesToSkip.has(operation.as)) {
                // Use LATERAL LEFT JOIN - can reference outer query aliases directly
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
            } else if (aliasesToSkip.has(operation.as)) {
                // This join will be replaced, so we'll create it when we process the enriching join
                // Just mark it as processed so the enriching join knows it exists
                processedAliases.add(operation.as);
            }
        }
    }

    return joinClauses;
}
import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";
import { JoinThroughMany } from "../../operations/join-through-many.operation.js";

export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    
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
                SELECT COALESCE(JSON_AGG(row_to_json(${operation.as})), '[]'::json) AS aggregated
                FROM "${operation.through}"
                INNER JOIN "${operation.from}" AS ${operation.as} 
                    ON ${operation.as}."${operation.foreignField}" = "${operation.through}"."${operation.throughForeignField}"
                WHERE "${operation.through}"."${operation.throughLocalField}" = ${localFieldRef}
                AND "${operation.through}"."_deleted" IS NULL
                AND ${operation.as}."_deleted" IS NULL
            ) AS ${operation.as} ON true`;
        }
    }
    
    return joinClauses;
}
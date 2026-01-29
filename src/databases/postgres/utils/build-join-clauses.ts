import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";

/**
 * Check if we should use a real PostgreSQL container instead of pg-mem
 * Set USE_REAL_POSTGRES=true to use Docker container
 */
const USE_REAL_POSTGRES = process.env.USE_REAL_POSTGRES === 'true';

export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    const joinManyOperations = operations.filter(op => op instanceof JoinMany) as JoinMany[];
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    
    // Regular one-to-one joins (LEFT JOIN)
    for (const operation of joinOperations) {
        // Prefix localField with main table name if provided
        const localFieldRef = mainTableName 
            ? `"${mainTableName}"."${operation.localField}"`
            : `"${operation.localField}"`;
        joinClauses += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localFieldRef} = "${operation.as}"."${operation.foreignField}"`;
    }
    
    // Many-to-one joins (JoinMany) - use LATERAL LEFT JOIN for pg-mem compatibility
    // Note: pg-mem cannot reference outer query aliases in LATERAL joins
    // We must use the main table's foreign key column instead of joined table references
    for (const joinMany of joinManyOperations) {
        // Determine the local field reference
        let localFieldRef: string;
        if (joinMany.localField.includes('.')) {
            const [tableAlias, columnName] = joinMany.localField.split('.');
            // Find the Join operation that created this alias
            const relatedJoin = joinOperations.find(j => j.as === tableAlias);
            if (relatedJoin) {
                if (USE_REAL_POSTGRES) {
                    // With real PostgreSQL, we can reference outer query aliases directly in LATERAL
                    localFieldRef = `${tableAlias}."${columnName}"`;
                } else {
                    // pg-mem limitation: can't reference outer query aliases in LATERAL
                    // Use the main table's foreign key column instead
                    // This works because: mainTable.localField = joinedTable.foreignField
                    localFieldRef = mainTableName 
                        ? `"${mainTableName}"."${relatedJoin.localField}"`
                        : `"${relatedJoin.localField}"`;
                }
            } else {
                // Fallback: try direct reference
                localFieldRef = `${tableAlias}."${columnName}"`;
            }
        } else {
            // Reference main table column directly
            localFieldRef = mainTableName 
                ? `"${mainTableName}"."${joinMany.localField}"`
                : `"${joinMany.localField}"`;
        }
        
        // Use LATERAL LEFT JOIN - must reference main table columns for pg-mem compatibility
        // row_to_json converts each row to a JSON object automatically
        joinClauses += ` LEFT JOIN LATERAL (
            SELECT COALESCE(JSON_AGG(row_to_json("${joinMany.from}")), '[]'::json) AS aggregated
            FROM "${joinMany.from}"
            WHERE "${joinMany.from}"."${joinMany.foreignField}" = ${localFieldRef}
            AND "${joinMany.from}"."_deleted" IS NULL
        ) AS ${joinMany.as} ON true`;
    }
    
    // Join-through operations (many-to-many) - use LATERAL LEFT JOIN
    // Note: pg-mem cannot reference outer query aliases in LATERAL joins
    // We must use the main table's foreign key column instead of joined table references
    for (const joinThrough of joinThroughOperations) {
        // Determine the local field reference
        let localFieldRef: string;
        if (joinThrough.localField.includes('.')) {
            const [tableAlias, columnName] = joinThrough.localField.split('.');
            // Find the Join operation that created this alias
            const relatedJoin = joinOperations.find(j => j.as === tableAlias);
            if (relatedJoin) {
                if (USE_REAL_POSTGRES) {
                    // With real PostgreSQL, we can reference outer query aliases directly in LATERAL
                    localFieldRef = `${tableAlias}."${columnName}"`;
                } else {
                    // pg-mem limitation: can't reference outer query aliases in LATERAL
                    // Use the main table's foreign key column instead
                    // This works because: mainTable.localField = joinedTable.foreignField
                    localFieldRef = mainTableName 
                        ? `"${mainTableName}"."${relatedJoin.localField}"`
                        : `"${relatedJoin.localField}"`;
                }
            } else {
                // Fallback: try direct reference
                localFieldRef = `${tableAlias}."${columnName}"`;
            }
        } else {
            // Reference main table column directly
            localFieldRef = mainTableName 
                ? `"${mainTableName}"."${joinThrough.localField}"`
                : `"${joinThrough.localField}"`;
        }
        
        // Use LATERAL LEFT JOIN - must reference main table columns for pg-mem compatibility
        // row_to_json converts each row to a JSON object automatically
        joinClauses += ` LEFT JOIN LATERAL (
            SELECT COALESCE(JSON_AGG(row_to_json(${joinThrough.as})), '[]'::json) AS aggregated
            FROM "${joinThrough.through}"
            INNER JOIN "${joinThrough.from}" AS ${joinThrough.as} 
                ON ${joinThrough.as}."${joinThrough.foreignField}" = "${joinThrough.through}"."${joinThrough.throughForeignField}"
            WHERE "${joinThrough.through}"."${joinThrough.throughLocalField}" = ${localFieldRef}
            AND "${joinThrough.through}"."_deleted" IS NULL
            AND ${joinThrough.as}."_deleted" IS NULL
        ) AS ${joinThrough.as} ON true`;
    }
    
    return joinClauses;
}
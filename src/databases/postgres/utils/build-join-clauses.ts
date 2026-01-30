import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
import { JoinMany } from "../../operations/join-many.operation.js";
import { JoinThrough } from "../../operations/join-through.operation.js";

export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    const joinManyOperations = operations.filter(op => op instanceof JoinMany) as JoinMany[];
    const joinThroughOperations = operations.filter(op => op instanceof JoinThrough) as JoinThrough[];
    
    // Regular one-to-one joins (LEFT JOIN)
    for (const operation of joinOperations) {
        // Determine the local field reference
        let localFieldRef: string;
        if (operation.localField.includes('.')) {
            // Reference a joined table alias (e.g., "agent.person_id")
            const [tableAlias, columnName] = operation.localField.split('.');
            localFieldRef = `${tableAlias}."${columnName}"`;
        } else {
            // Reference main table column directly
            localFieldRef = mainTableName 
                ? `"${mainTableName}"."${operation.localField}"`
                : `"${operation.localField}"`;
        }
        joinClauses += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localFieldRef} = "${operation.as}"."${operation.foreignField}"`;
    }
    
    // Many-to-one joins (JoinMany) - use LATERAL LEFT JOIN
    // LATERAL joins allow referencing outer query columns, making it efficient for correlated subqueries
    for (const joinMany of joinManyOperations) {
        // Determine the local field reference
        let localFieldRef: string;
        if (joinMany.localField.includes('.')) {
            // Reference a joined table alias (e.g., "person._id")
            const [tableAlias, columnName] = joinMany.localField.split('.');
            localFieldRef = `${tableAlias}."${columnName}"`;
        } else {
            // Reference main table column directly
            localFieldRef = mainTableName 
                ? `"${mainTableName}"."${joinMany.localField}"`
                : `"${joinMany.localField}"`;
        }
        
        // Use LATERAL LEFT JOIN - can reference outer query aliases directly
        // row_to_json converts each row to a JSON object automatically
        joinClauses += ` LEFT JOIN LATERAL (
            SELECT COALESCE(JSON_AGG(row_to_json("${joinMany.from}")), '[]'::json) AS aggregated
            FROM "${joinMany.from}"
            WHERE "${joinMany.from}"."${joinMany.foreignField}" = ${localFieldRef}
            AND "${joinMany.from}"."_deleted" IS NULL
        ) AS ${joinMany.as} ON true`;
    }
    
    // Join-through operations (many-to-many) - use LATERAL LEFT JOIN
    // LATERAL joins allow referencing outer query columns, making it efficient for correlated subqueries
    for (const joinThrough of joinThroughOperations) {
        // Determine the local field reference
        let localFieldRef: string;
        if (joinThrough.localField.includes('.')) {
            // Reference a joined table alias (e.g., "person._id")
            const [tableAlias, columnName] = joinThrough.localField.split('.');
            localFieldRef = `${tableAlias}."${columnName}"`;
        } else {
            // Reference main table column directly
            localFieldRef = mainTableName 
                ? `"${mainTableName}"."${joinThrough.localField}"`
                : `"${joinThrough.localField}"`;
        }
        
        // Use LATERAL LEFT JOIN - can reference outer query aliases directly
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
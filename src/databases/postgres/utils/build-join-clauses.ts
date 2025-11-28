import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";

export function buildJoinClauses(operations: Operation[], mainTableName?: string): string {
    let joinClauses = '';
    const joinOperations = operations.filter(op => op instanceof Join) as Join[];
    
    for (const operation of joinOperations) {
        // Prefix localField with main table name if provided
        const localFieldRef = mainTableName 
            ? `"${mainTableName}"."${operation.localField}"`
            : `"${operation.localField}"`;
        joinClauses += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localFieldRef} = "${operation.as}"."${operation.foreignField}"`;
    }
    return joinClauses;
}
import { Operation } from "../../operations/operation.js";

export function buildJoinClauses(operations: Operation[]): string {
    let joinClauses = '';
    for (const operation of operations) {
        joinClauses += `LEFT JOIN "${operation.from}" AS ${operation.as} ON "${operation.localField}" = "${operation.as}"."${operation.foreignField}"`;
    }
    return joinClauses;
}
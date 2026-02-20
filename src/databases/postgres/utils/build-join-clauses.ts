import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
import { toSnakeCase } from "./convert-keys.util.js";

/**
 * Builds SQL JOIN clauses for join operations.
 * *
 * @param operations - Join operations to build clauses for
 * @param mainTableName - Optional main table name; when provided, the join table is aliased (AS) and the ON clause left side is qualified for the main table
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName?: string
): string {
    const joinClauses: string[] = [];
    for (const operation of operations) {
        if (operation instanceof LeftJoin || operation instanceof InnerJoin || operation instanceof LeftJoinMany) {
            const joinType = operation instanceof InnerJoin ? "INNER JOIN" : "LEFT JOIN";
            // When localField contains ".", it references a previous join alias (e.g. "client_person._id").
            let leftSide: string;
            if (operation.localField.includes(".")) {
                const [alias, column] = operation.localField.split(".");
                leftSide = `"${alias}"."${column}"`;
            } else {
                leftSide = mainTableName ? `"${mainTableName}"."${operation.localField}"` : `"${operation.localField}"`;
            }
            joinClauses.push(`${joinType} "${operation.from}" AS "${operation.as}" ON ${leftSide} = "${operation.as}"."${operation.foreignField}"`);
        }
    }
    return joinClauses.join(' ');
}

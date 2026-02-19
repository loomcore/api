import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";
import { toSnakeCase } from "./convert-keys.util.js";

/**
 * Converts a field name to snake_case for database column names.
 * Preserves keys that start with underscore (e.g. _id).
 */
function convertFieldToSnakeCase(field: string): string {
    if (field.startsWith("_")) {
        return field;
    }
    return toSnakeCase(field);
}

/**
 * Builds SQL JOIN clauses for join operations.
 * Supports LeftJoin (LEFT JOIN), InnerJoin (INNER JOIN), and LeftJoinMany (LEFT JOIN with JSON aggregation).
 * LeftJoinMany is not joined here; the SELECT clause uses a scalar subquery with jsonb_agg for each.
 * @param operations - Join operations to build clauses for
 * @param mainTableName - Optional main table name; when provided, the join table is aliased (AS) and the ON clause left side is qualified for clarity
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName?: string
): string {
    let joinClauses = [];
    for (const operation of operations) {
        if (operation instanceof LeftJoin || operation instanceof InnerJoin || operation instanceof LeftJoinMany) {
            const localRef = convertFieldToSnakeCase(
                operation.localField
            );
            const foreignSnake = convertFieldToSnakeCase(
                operation.foreignField
            );
            const joinType = operation instanceof InnerJoin ? "INNER JOIN" : "LEFT JOIN";
            // Alias the join table so SELECT clause can reference operation.as (e.g. category."_id")
            const joinTable = `"${operation.from}" AS "${operation.as}"`;
            const leftSide = mainTableName ? `"${mainTableName}"."${localRef}"` : localRef;
            joinClauses.push(`${joinType} ${joinTable} ON ${leftSide} = ${operation.as}."${foreignSnake}"`);
        }
    }
    return joinClauses.join(' ');
}

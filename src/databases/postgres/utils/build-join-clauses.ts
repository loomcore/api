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
 *
 * Field names (localField, foreignField) may be camelCase or snake_case; they are
 * converted to snake_case for PostgreSQL. Prefer camelCase to match domain/API convention.
 *
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
            const localColumn = convertFieldToSnakeCase(operation.localField);
            const foreignColumn = convertFieldToSnakeCase(operation.foreignField);
            const leftSide = mainTableName ? `"${mainTableName}"."${localColumn}"` : `"${localColumn}"`;
            joinClauses.push(`${joinType} "${operation.from}" AS "${operation.as}" ON ${leftSide} = ${operation.as}."${foreignColumn}"`);
        }
    }
    return joinClauses.join(' ');
}

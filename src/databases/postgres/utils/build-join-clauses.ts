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
 * Resolves a local field reference to a SQL expression for use in JOIN ON clauses.
 * - Direct main table: "person_id" -> "main_table"."person_id" (snake_case)
 * - Joined table: "alias.field" -> alias."field" (snake_case)
 */
function resolveLocalField(
    localField: string,
    mainTableName: string
): string {
    if (!localField.includes(".")) {
        const snake = convertFieldToSnakeCase(localField);
        return `"${mainTableName}"."${snake}"`;
    }
    const [alias, field] = localField.split(".");
    const snake = convertFieldToSnakeCase(field);
    return `${alias}."${snake}"`;
}

/**
 * Builds SQL JOIN clauses for join operations.
 * Supports LeftJoin (LEFT JOIN), InnerJoin (INNER JOIN), and LeftJoinMany (LEFT JOIN with JSON aggregation).
 * LeftJoinMany is not joined here; the SELECT clause uses a scalar subquery with jsonb_agg for each.
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName: string
): string {
    // Only add JOIN for one-to-one (LeftJoin, InnerJoin). LeftJoinMany is handled in the SELECT via scalar subquery.
    let joinClause = "";
    for (const operation of operations) {
        if (operation instanceof LeftJoin || operation instanceof InnerJoin) {
            const localRef = resolveLocalField(
                operation.localField,
                mainTableName
            );
            const foreignSnake = convertFieldToSnakeCase(
                operation.foreignField
            );
            const joinType = operation instanceof InnerJoin ? "INNER JOIN" : "LEFT JOIN";
            joinClause = `${joinClause} ${joinType} "${operation.from}" AS ${operation.as} ON ${localRef} = ${operation.as}."${foreignSnake}"`;
        }
    }
    return joinClause;
}

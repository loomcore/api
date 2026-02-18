import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
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
 * Builds SQL JOIN clauses for LeftJoin, InnerJoin, and LeftJoinMany operations.
 * LeftJoinMany operations are handled separately via aggregation, so they are ignored here.
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName: string
): string {
    let joinClause = "";
    for (const operation of operations) {
        if (operation instanceof LeftJoin) {
            const localRef = resolveLocalField(
                operation.localField,
                mainTableName
            );
            const foreignSnake = convertFieldToSnakeCase(
                operation.foreignField
            );
            joinClause += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localRef} = ${operation.as}."${foreignSnake}"`;
        } else if (operation instanceof InnerJoin) {
            const localRef = resolveLocalField(
                operation.localField,
                mainTableName
            );
            const foreignSnake = convertFieldToSnakeCase(
                operation.foreignField
            );
            joinClause += ` INNER JOIN "${operation.from}" AS ${operation.as} ON ${localRef} = ${operation.as}."${foreignSnake}"`;
        }
        // LeftJoinMany operations are handled via aggregation, not SQL joins
    }
    return joinClause;
}

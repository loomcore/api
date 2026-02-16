import { Operation } from "../../operations/operation.js";
import { Join } from "../../operations/join.operation.js";
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
 * Builds SQL LEFT JOIN clauses for Join operations (one-to-one).
 * Only supports the basic Join operator; other operation types are ignored.
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName: string
): string {
    let joinClause = "";
    for (const operation of operations) {
        if (operation instanceof Join) {
            const localRef = resolveLocalField(
                operation.localField,
                mainTableName
            );
            const foreignSnake = convertFieldToSnakeCase(
                operation.foreignField
            );
            joinClause += ` LEFT JOIN "${operation.from}" AS ${operation.as} ON ${localRef} = ${operation.as}."${foreignSnake}"`;
        }
    }
    return joinClause;
}

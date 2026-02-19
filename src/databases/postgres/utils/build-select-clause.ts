import { Client } from 'pg';
import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
import { toSnakeCase } from './convert-keys.util.js';

/**
 * Converts a field name to snake_case for database column names.
 * Preserves keys that start with underscore (e.g. _id).
 */
function convertFieldToSnakeCase(field: string): string {
    if (field.startsWith('_')) {
        return field;
    }
    return toSnakeCase(field);
}

/**
 * Resolves the local side of a join to a SQL expression (for use in scalar subquery correlation).
 * - Direct: "categoryId" -> "mainTable"."category_id"
 * - Nested: "clients._id" -> clients."_id"
 * - LeftJoinMany array: "client_policies._id" -> extracts _id values from JSON array
 */
function resolveLocalRef(
    localField: string,
    mainTableName: string,
    operations: Operation[],
    currentIndex: number
): string {
    if (!localField.includes('.')) {
        const snake = convertFieldToSnakeCase(localField);
        return `"${mainTableName}"."${snake}"`;
    }
    const [alias, field] = localField.split('.');
    const snake = convertFieldToSnakeCase(field);
    
    // Check if alias references a previous LeftJoinMany (which is a JSON array, not a table)
    const priorOps = operations.slice(0, currentIndex);
    const leftJoinMany = priorOps.find(
        (op): op is LeftJoinMany => op instanceof LeftJoinMany && op.as === alias
    );
    
    if (leftJoinMany) {
        // Extract field values from the JSON array as a subquery for use with IN
        // Cast to appropriate type based on field name (assume integer for _id, text otherwise)
        const castType = field === '_id' || snake === '_id' ? '::int' : '::text';
        const elemAlias = `_elem_${alias}`;
        return `(SELECT (${elemAlias}->>'${snake}')${castType} FROM jsonb_array_elements("${alias}") AS ${elemAlias})`;
    }
    
    // Regular table alias reference
    return `${alias}."${snake}"`;
}

/**
 * Gets column names for a table from PostgreSQL information_schema
 */
async function getTableColumns(client: Client, tableName: string): Promise<string[]> {
    const result = await client.query<{ column_name: string }>(
        `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = $1
            ORDER BY ordinal_position
        `,
        [tableName]
    );
    return result.rows.map(row => row.column_name);
}

/**
 * Checks if an operation enriches another array join.
 */
function findEnrichmentTarget(
    operation: LeftJoinMany,
    operations: Operation[]
): { target: LeftJoinMany; field: string } | null {
    if (!operation.localField.includes('.')) {
        return null;
    }

    const [alias] = operation.localField.split('.');
    const target = operations.find(op =>
        op instanceof LeftJoinMany && op.as === alias
    ) as LeftJoinMany | undefined;

    if (target && operations.indexOf(target) < operations.indexOf(operation)) {
        return { target, field: operation.localField.split('.')[1] };
    }

    return null;
}

/**
 * Builds a SELECT clause with explicit column names and table aliases.
 * 
 * - Main table: all columns with table prefix
 * - LeftJoin/InnerJoin (one-to-one): columns prefixed with alias (e.g., "category__id")
 * - LeftJoinMany (arrays): scalar subquery with jsonb_agg(jsonb_build_object(...))
 */
export async function buildSelectClause(
    client: Client,
    mainTableName: string,
    mainTableAlias: string,
    operations: Operation[]
): Promise<string> {
    const leftJoinOperations = operations.filter(op => op instanceof LeftJoin) as LeftJoin[];
    const innerJoinOperations = operations.filter(op => op instanceof InnerJoin) as InnerJoin[];
    const leftJoinManyOperations = operations.filter(op => op instanceof LeftJoinMany) as LeftJoinMany[];

    // Main table columns
    const mainTableColumns = await getTableColumns(client, mainTableName);
    const mainSelects = mainTableColumns.map(col => `"${mainTableName}"."${col}" AS "${col}"`);

    const joinSelects: string[] = [];

    // One-to-one joins: select columns with prefix
    for (const join of [...leftJoinOperations, ...innerJoinOperations]) {
        const joinColumns = await getTableColumns(client, join.from);
        for (const col of joinColumns) {
            joinSelects.push(`${join.as}."${col}" AS "${join.as}__${col}"`);
        }
    }

    // LeftJoinMany: scalar subquery with jsonb_agg and jsonb_build_object (no .aggregated)
    // Note: All LeftJoinMany operations are queried here; nesting/placement is handled in transform step
    for (let i = 0; i < leftJoinManyOperations.length; i++) {
        const joinMany = leftJoinManyOperations[i];
        const manyColumns = await getTableColumns(client, joinMany.from);
        const foreignSnake = convertFieldToSnakeCase(joinMany.foreignField);
        const currentOpIndex = operations.indexOf(joinMany);
        const localRef = resolveLocalRef(joinMany.localField, mainTableName, operations, currentOpIndex);
        const subAlias = `_sub_${joinMany.as}`;
        const objParts = manyColumns.map(c => `'${c.replace(/'/g, "''")}', ${subAlias}."${c}"`).join(', ');
        
        // Check if localField references a previous LeftJoinMany (which is a JSON array column)
        const priorOps = operations.slice(0, currentOpIndex);
        const referencedLeftJoinMany = joinMany.localField.includes('.') 
            ? priorOps.find(
                (op): op is LeftJoinMany => 
                    op instanceof LeftJoinMany && op.as === joinMany.localField.split('.')[0]
            )
            : null;
        
        let whereClause: string;
        if (referencedLeftJoinMany) {
            // Instead of referencing the JSON array column (which we can't do in same SELECT),
            // inline the previous LeftJoinMany's condition by referencing the original source
            const [prevAlias, fieldName] = joinMany.localField.split('.');
            const prevFieldSnake = convertFieldToSnakeCase(fieldName);
            
            // Recursively resolve the localField of the referenced LeftJoinMany to build nested IN queries
            // This handles chained LeftJoinMany (e.g., client_policies -> client_agents_policies -> client_policies_agents)
            // Returns a subquery that extracts the field value from the chain
            const buildNestedInQuery = (refOp: LeftJoinMany, extractField: string): string => {
                const extractFieldSnake = convertFieldToSnakeCase(extractField);
                const refForeignSnake = convertFieldToSnakeCase(refOp.foreignField);
                
                if (!refOp.localField.includes('.')) {
                    // Base case: refOp references main table directly
                    const refLocalSnake = convertFieldToSnakeCase(refOp.localField);
                    return `(SELECT "${extractFieldSnake}" FROM "${refOp.from}" WHERE "${refOp.from}"."${refForeignSnake}" = "${mainTableName}"."${refLocalSnake}")`;
                }
                
                // Recursive case: refOp references another LeftJoinMany
                const [parentAlias, parentField] = refOp.localField.split('.');
                const parentOpIndex = operations.indexOf(refOp);
                const parentOp = operations.slice(0, parentOpIndex).find(
                    (op): op is LeftJoinMany => op instanceof LeftJoinMany && op.as === parentAlias
                );
                
                if (parentOp) {
                    // Recursively build the nested query for the parent
                    const parentFieldSnake = convertFieldToSnakeCase(parentField);
                    const nestedQuery = buildNestedInQuery(parentOp, parentFieldSnake);
                    return `(SELECT "${extractFieldSnake}" FROM "${refOp.from}" WHERE "${refOp.from}"."${refForeignSnake}" IN ${nestedQuery})`;
                }
                
                // Fallback: not a LeftJoinMany reference, use regular table alias
                const parentFieldSnake = convertFieldToSnakeCase(parentField);
                return `(SELECT "${extractFieldSnake}" FROM "${refOp.from}" WHERE "${refOp.from}"."${refForeignSnake}" = ${parentAlias}."${parentFieldSnake}")`;
            };
            
            const nestedQuery = buildNestedInQuery(referencedLeftJoinMany, prevFieldSnake);
            whereClause = `${subAlias}."${foreignSnake}" IN ${nestedQuery}`;
        } else {
            // Regular equality
            whereClause = `${subAlias}."${foreignSnake}" = ${localRef}`;
        }
        
        const subquery = `(SELECT COALESCE(jsonb_agg(jsonb_build_object(${objParts})), '[]'::jsonb) FROM "${joinMany.from}" AS ${subAlias} WHERE ${whereClause})`;
        joinSelects.push(`${subquery} AS "${joinMany.as}"`);
    }

    // Combine all selects
    const allSelects = [...mainSelects, ...joinSelects];
    return allSelects.join(', ');
}

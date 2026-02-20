import { Operation } from "../../operations/operation.js";
import { LeftJoin } from "../../operations/left-join.operation.js";
import { InnerJoin } from "../../operations/inner-join.operation.js";
import { LeftJoinMany } from "../../operations/left-join-many.operation.js";

export interface BuildJoinClausesOptions {
    /** When true, only LeftJoin and InnerJoin are included whose parent is in scope (main table or another one-to-one in FROM). Excludes LeftJoinMany and one-to-one joins that reference a many (e.g. policy_agents_through referencing client_policies). Use with JSON select. */
    oneToOneOnly?: boolean;
}

function getParentAlias(localField: string): string | null {
    if (!localField.includes('.')) return null;
    return localField.split('.')[0];
}

/** Aliases that are used as through-tables by a LeftJoinMany (e.g. client_phone_numbers_through). For getById we use LEFT JOIN so the main row is preserved when there are no related records. */
function getThroughTableAliases(operations: Operation[]): Set<string> {
    const through = new Set<string>();
    for (const op of operations) {
        if (op instanceof LeftJoinMany && op.localField.includes('.')) {
            through.add(op.localField.split('.')[0]);
        }
    }
    return through;
}

/**
 * Builds SQL JOIN clauses for join operations.
 *
 * @param operations - Join operations to build clauses for
 * @param mainTableName - Optional main table name; when provided, the join table is aliased (AS) and the ON clause left side is qualified for the main table
 * @param options - When oneToOneOnly is true, only one-to-one joins whose parent is in FROM scope are included
 */
export function buildJoinClauses(
    operations: Operation[],
    mainTableName?: string,
    options?: BuildJoinClausesOptions
): string {
    const oneToOneOnly = options?.oneToOneOnly ?? false;
    const throughTableAliases = oneToOneOnly ? getThroughTableAliases(operations) : new Set<string>();
    const joinClauses: string[] = [];
    const oneToOneAliasesInScope = new Set<string>();

    for (const operation of operations) {
        if (operation instanceof LeftJoinMany) {
            if (oneToOneOnly) continue;
        } else if (operation instanceof LeftJoin || operation instanceof InnerJoin) {
            if (oneToOneOnly) {
                const parent = getParentAlias(operation.localField);
                const parentInScope = parent === null || parent === mainTableName || oneToOneAliasesInScope.has(parent);
                if (!parentInScope) continue;
                oneToOneAliasesInScope.add(operation.as);
            }
        }

        if (operation instanceof LeftJoin || operation instanceof InnerJoin || operation instanceof LeftJoinMany) {
            // For getById (oneToOneOnly), use LEFT JOIN for through-tables so the main row is not dropped when there are no related records
            const useLeftJoin = oneToOneOnly && operation instanceof InnerJoin && throughTableAliases.has(operation.as);
            const joinType = useLeftJoin || operation instanceof LeftJoin || operation instanceof LeftJoinMany ? "LEFT JOIN" : "INNER JOIN";
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

import { Operation } from '../../operations/operation.js';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';

/**
 * Parses a value that may be JSON (string or already parsed) into an object or array.
 */
function parseJsonValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as unknown;
        } catch {
            return value;
        }
    }
    return value;
}

/**
 * Returns the set of join aliases and a map of alias -> parent alias (null when top-level).
 */
function getJoinAliasesAndParents(operations: Operation[]): { aliases: Set<string>; parentByAlias: Map<string, string | null> } {
    const aliases = new Set<string>();
    const parentByAlias = new Map<string, string | null>();
    for (const op of operations) {
        if (op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany) {
            aliases.add(op.as);
            const parent = op.localField.includes('.') ? op.localField.split('.')[0] : null;
            parentByAlias.set(op.as, parent);
        }
    }
    return { aliases, parentByAlias };
}

const PREFIX_SEP = '__';

/**
 * Places a join value into joinData at the correct path (top-level or nested under parent).
 */
function setJoinValue(
    joinData: Record<string, unknown>,
    alias: string,
    value: unknown,
    parentByAlias: Map<string, string | null>
): void {
    const parent = parentByAlias.get(alias) ?? null;
    if (parent) {
        let parentObj = joinData[parent];
        if (parentObj == null || typeof parentObj !== 'object' || Array.isArray(parentObj)) {
            parentObj = {};
            joinData[parent] = parentObj;
        }
        (parentObj as Record<string, unknown>)[alias] = value;
    } else {
        joinData[alias] = value;
    }
}

/**
 * Transforms PostgreSQL JOIN results into nested objects.
 *
 * Supports two row shapes:
 * 1. JSON columns: one column per join alias (from jsonb_build_object / jsonb_agg). Placed under _joinData, nested when localField references another join (e.g. "clients._id").
 * 2. Prefixed columns: alias__column. Grouped into _joinData[alias], nested under parent when localField references another join.
 *
 * Main table columns are copied to the top level.
 */
export function transformJoinResults<T>(
    rows: Record<string, unknown>[],
    operations: Operation[]
): T[] {
    const { aliases: joinAliases, parentByAlias } = getJoinAliasesAndParents(operations);

    if (joinAliases.size === 0) {
        return rows as T[];
    }

    return rows.map((row) => {
        const transformed: Record<string, unknown> = {};
        const flatJoinValues: Record<string, unknown> = {};
        const prefixedByAlias: Record<string, Record<string, unknown>> = {};

        for (const key of Object.keys(row)) {
            if (joinAliases.has(key)) {
                flatJoinValues[key] = parseJsonValue(row[key]);
            } else if (key.includes(PREFIX_SEP)) {
                const i = key.indexOf(PREFIX_SEP);
                const alias = key.slice(0, i);
                const column = key.slice(i + PREFIX_SEP.length);
                if (joinAliases.has(alias)) {
                    if (!prefixedByAlias[alias]) prefixedByAlias[alias] = {};
                    prefixedByAlias[alias][column] = row[key];
                } else {
                    transformed[key] = row[key];
                }
            } else {
                transformed[key] = row[key];
            }
        }

        for (const alias of Object.keys(prefixedByAlias)) {
            const obj = prefixedByAlias[alias];
            const hasAny = Object.values(obj).some(v => v !== null && v !== undefined);
            if (!(alias in flatJoinValues)) {
                flatJoinValues[alias] = hasAny ? obj : null;
            }
        }

        // Build nested _joinData in operation order so parents exist before children
        const joinData: Record<string, unknown> = {};
        for (const op of operations) {
            if (!(op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany)) continue;
            const alias = op.as;
            const value = flatJoinValues[alias];
            if (value === undefined) continue;
            setJoinValue(joinData, alias, value, parentByAlias);
        }

        if (Object.keys(joinData).length > 0) {
            transformed._joinData = joinData;
        }

        return transformed as T;
    });
}

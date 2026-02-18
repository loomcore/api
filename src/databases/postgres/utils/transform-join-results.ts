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
 * Returns the set of join aliases from operations (one-to-one and one-to-many).
 */
function getJoinAliases(operations: Operation[]): Set<string> {
    const aliases = new Set<string>();
    for (const op of operations) {
        if (op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany) {
            aliases.add(op.as);
        }
    }
    return aliases;
}

const PREFIX_SEP = '__';

/**
 * Transforms PostgreSQL JOIN results into nested objects.
 *
 * Supports two row shapes (so it works with both current and future SELECT clauses):
 * 1. JSON columns: one column per join alias (e.g. "category") whose value is
 *    from jsonb_build_object / jsonb_agg (object or array). Parsed and placed under _joinData.
 * 2. Prefixed columns: alias__column (e.g. "category__id", "category__name").
 *    Grouped into _joinData[alias] = { column: value, ... }.
 *
 * Main table columns (no join prefix) are copied to the top level.
 */
export function transformJoinResults<T>(
    rows: Record<string, unknown>[],
    operations: Operation[]
): T[] {
    const joinAliases = getJoinAliases(operations);

    if (joinAliases.size === 0) {
        return rows as T[];
    }

    return rows.map((row) => {
        const transformed: Record<string, unknown> = {};
        const joinData: Record<string, unknown> = {};
        const prefixedByAlias: Record<string, Record<string, unknown>> = {};

        for (const key of Object.keys(row)) {
            if (joinAliases.has(key)) {
                joinData[key] = parseJsonValue(row[key]);
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
            if (!(alias in joinData)) {
                joinData[alias] = hasAny ? obj : null;
            }
        }

        if (Object.keys(joinData).length > 0) {
            transformed._joinData = joinData;
        }

        return transformed as T;
    });
}

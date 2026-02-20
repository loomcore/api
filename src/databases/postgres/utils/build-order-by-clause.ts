import { IQueryOptions } from "@loomcore/common/models";

export interface BuildOrderByClauseOptions {
    /** When set, qualifies the order column (e.g. "table"."orderBy") to avoid ambiguity with joins */
    tablePrefix?: string;
}

export function buildOrderByClause(queryObject: IQueryOptions, options?: BuildOrderByClauseOptions): string {
    if (!queryObject.orderBy) {
        return '';
    }
    const orderBy = queryObject.orderBy;
    const sortDirection = queryObject.sortDirection || 'asc';
    const qualified = options?.tablePrefix ? `"${options.tablePrefix}"."${orderBy}"` : orderBy;
    return `ORDER BY ${qualified} ${sortDirection}`;
}
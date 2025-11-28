import { IQueryOptions } from "@loomcore/common/models";

export function buildOrderByClause(queryObject: IQueryOptions): string {

    if (!queryObject.orderBy) {
        return '';
    }
    const orderBy = queryObject.orderBy;
    const sortDirection = queryObject.sortDirection || 'asc';
    return `ORDER BY ${orderBy} ${sortDirection}`;
}
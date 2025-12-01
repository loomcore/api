import { IQueryOptions } from "@loomcore/common/models";

export function buildPaginationClause(queryObject: IQueryOptions): string {
    if (!queryObject.page || !queryObject.pageSize) {
        return '';
    }
    const page = queryObject.page;
    const pageSize = queryObject.pageSize;
    const offset = (page - 1) * pageSize;
    return `LIMIT ${pageSize} OFFSET ${offset}`;
}
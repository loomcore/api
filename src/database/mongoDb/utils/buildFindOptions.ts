import { FindOptions } from "mongodb";
import { IQueryOptions } from "@loomcore/common/models";


export function buildFindOptions(queryOptions: IQueryOptions): FindOptions {
    let findOptions: FindOptions = {};
    if (queryOptions) {
		if (queryOptions.orderBy) {
			findOptions.sort = {
                [queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1
			};
		}

		if (queryOptions.page && queryOptions.pageSize) {
			findOptions.skip = (queryOptions.page - 1) * queryOptions.pageSize;
			findOptions.limit = queryOptions.pageSize;
		}
	}
    return findOptions;
}


import {SortDirection} from './types/sort-direction.type.js';

/**
 * Allows reading the filters object in the query options.
 * 
 * @example in query string:
 * filters[name][contains]=burk
 */
export type Filter = {
	eq?: string | number | boolean | Date;
	ne?: string | number | boolean | Date;
	any?: string[] | number[];
	all?: string[] | number[];
	lt?: number | Date;
	lte?: number | Date;
	gt?: number | Date;
	gte?: number | Date;
	startsWith?: string;
	endsWith?: string;
	contains?: string;
};

export interface IQueryOptions {
	orderBy?: string;
	sortDirection?: SortDirection;
	page?: number;
	pageSize?: number;
	/** This is an index signature that indicates the keys of the filters object are strings, and the values
	 * are of type Filter */
	filters?: { [key: string]: Filter };
}

export class QueryOptions implements IQueryOptions {
	orderBy?: string;
	sortDirection: SortDirection;
	page: number;
	pageSize: number;
	filters?: { [key: string]: Filter };

	constructor(options: IQueryOptions = {}) {
		this.orderBy = options.orderBy;
		this.sortDirection = options.sortDirection ?? 'asc';
		this.page = options.page ?? 1;
		this.pageSize = options.pageSize ?? 10;
		this.filters = options.filters;
	}
}


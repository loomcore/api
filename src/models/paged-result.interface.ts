export interface IPagedResult<T> {
	entities?: T[];
	total?: number;
	page?: number;
	pageSize?: number;
  totalPages?: number;
}

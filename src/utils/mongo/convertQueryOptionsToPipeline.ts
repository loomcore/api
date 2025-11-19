import { IQueryOptions } from '@loomcore/common/models';
import { Document } from 'mongodb';

export function convertQueryOptionsToPipeline(queryOptions: IQueryOptions, pagination: boolean): Document[] {
	let pipeline: Document[] = [];

	if (queryOptions.orderBy || (queryOptions.page && queryOptions.pageSize)) {
		let results : Document[] = [];
		if (queryOptions.orderBy) {
			results.push({
				$sort: {
					[queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1
				}
			});
		}

		if (queryOptions.page && queryOptions.pageSize) {
			results.push({ $skip: (queryOptions.page - 1) * queryOptions.pageSize });
			results.push({ $limit: queryOptions.pageSize });
		}


		if (pagination) {
			pipeline.push({
				$facet: {
					data: results,
					count: [{ $count: 'total' }]
				}
			},{
				$project: {
					data: 1,
					total: { $arrayElemAt: ['$count.total', 0] }
				}
			});
		} else {
			pipeline.push({
				$facet: {
					data: results,
					count: [{ $count: 'total' }]
				}
			},{
				$project: {
					data: 1,
					total: { $arrayElemAt: ['$count.total', 0] }
				}
			});
		}
	}

	return pipeline;
}

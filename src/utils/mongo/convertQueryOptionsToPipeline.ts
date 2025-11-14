import { IQueryOptions } from '@loomcore/common/models';
import { Document } from 'mongodb';

export function convertQueryOptionsToPipeline(queryOptions: IQueryOptions): Document[] {
	let pipeline: Document[] = [];

	pipeline.push(
		{
			$facet: {
				data: (() => {
					const resultStages: Document[] = [];
					if (queryOptions) {
						if (queryOptions.orderBy) {
							resultStages.push({
								$sort: {
									[queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1
								}
							});
						}

						if (queryOptions.page && queryOptions.pageSize) {
							resultStages.push({ $skip: (queryOptions.page - 1) * queryOptions.pageSize });
							resultStages.push({ $limit: queryOptions.pageSize });
						}
					}
					return resultStages;
				})(),
				count: [{ $count: 'total' }]
			}
		},
		{
			$project: {
				data: 1,
				total: { $arrayElemAt: ['$count.total', 0] }
			}
		}
	);
	return pipeline;
}

import { Document } from 'mongodb';
import { Join } from '../../databases/operations/join.js';
import { Operation } from '../../databases/operations/operation.js';

export function convertOperationsToPipeline(operations: Operation[]): Document[] {
	let pipeline: Document[] = [];

	operations.forEach(operation => {
		if (operation instanceof Join) {
			pipeline.push({
				$lookup: {
					from: operation.from,
					localField: operation.localField,
					foreignField: operation.foreignField,
					as: `${operation.as}Arr`
				}
			},
			{
				$unwind: {
					path: `$${operation.as}Arr`,
					preserveNullAndEmptyArrays: true
				}
			},
			{
				$addFields: {
					[operation.as]: `$${operation.as}Arr`
				}
			},
			{
				$project: {
					[`${operation.as}Arr`]: 0
				}
			});
		}
	});

	return pipeline;
}

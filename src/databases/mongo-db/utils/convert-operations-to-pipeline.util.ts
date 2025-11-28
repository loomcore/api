import { Document } from 'mongodb';
import { Join } from '../../operations/join.operation.js';
import { Operation } from '../../operations/operation.js';

export function convertOperationsToPipeline(operations: Operation[]): Document[] {
	let pipeline: Document[] = [];

	operations.forEach(operation => {
		if (operation instanceof Join) {
			// Check if the foreignField is '_id' (which is always ObjectId in MongoDB)
			// and if the localField value might be a string that needs conversion
			const needsObjectIdConversion = operation.foreignField === '_id';
			
			if (needsObjectIdConversion) {
				// Use $expr with $eq to handle ObjectId conversion for the lookup
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							let: { localId: { $cond: [
								{ $eq: [{ $type: `$${operation.localField}` }, 'string'] },
								{ $toObjectId: `$${operation.localField}` },
								`$${operation.localField}`
							]}},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: [`$${operation.foreignField}`, '$$localId']
										}
									}
								}
							],
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
					}
				);
			} else {
				// Use simple lookup for non-ObjectId fields
				pipeline.push(
					{
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
					}
				);
			}
		}
	});

	return pipeline;
}

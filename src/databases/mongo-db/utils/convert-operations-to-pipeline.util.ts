import { Document } from 'mongodb';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { Operation } from '../../operations/operation.js';

export function convertOperationsToPipeline(operations: Operation[]): Document[] {
	let pipeline: Document[] = [];

	operations.forEach(operation => {
		if (operation instanceof Join) {
			// One-to-one join: lookup and unwind to single object
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
		} else if (operation instanceof JoinMany) {
			// Many-to-one join: lookup without unwind (keep as array)
			const needsObjectIdConversion = operation.foreignField === '_id';
			
			if (needsObjectIdConversion) {
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
							as: operation.as
						}
					}
				);
			} else {
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							localField: operation.localField,
							foreignField: operation.foreignField,
							as: operation.as
						}
					}
				);
			}
		} else if (operation instanceof JoinThrough) {
			// Many-to-many join through intermediate collection: nested lookup
			// First lookup the join table, then lookup the target collection
			const needsObjectIdConversion = operation.foreignField === '_id';
			
			if (needsObjectIdConversion) {
				pipeline.push(
					{
						$lookup: {
							from: operation.through,
							let: { localId: { $cond: [
								{ $eq: [{ $type: `$${operation.localField}` }, 'string'] },
								{ $toObjectId: `$${operation.localField}` },
								`$${operation.localField}`
							]}},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: [`$${operation.throughLocalField}`, '$$localId']
										}
									}
								}
							],
							as: `${operation.as}_through`
						}
					},
					{
						$unwind: {
							path: `$${operation.as}_through`,
							preserveNullAndEmptyArrays: true
						}
					},
					{
						$lookup: {
							from: operation.from,
							let: { foreignId: { $cond: [
								{ $eq: [{ $type: `$${operation.as}_through.${operation.throughForeignField}` }, 'string'] },
								{ $toObjectId: `$${operation.as}_through.${operation.throughForeignField}` },
								`$${operation.as}_through.${operation.throughForeignField}`
							]}},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: [`$${operation.foreignField}`, '$$foreignId']
										}
									}
								}
							],
							as: `${operation.as}_temp`
						}
					},
					{
						$group: {
							_id: '$_id',
							root: { $first: '$$ROOT' },
							[operation.as]: { $push: { $arrayElemAt: [`$${operation.as}_temp`, 0] } }
						}
					},
					{
						$replaceRoot: {
							newRoot: {
								$mergeObjects: ['$root', { [operation.as]: `$${operation.as}` }]
							}
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0
						}
					}
				);
			} else {
				pipeline.push(
					{
						$lookup: {
							from: operation.through,
							localField: operation.localField,
							foreignField: operation.throughLocalField,
							as: `${operation.as}_through`
						}
					},
					{
						$unwind: {
							path: `$${operation.as}_through`,
							preserveNullAndEmptyArrays: true
						}
					},
					{
						$lookup: {
							from: operation.from,
							localField: `${operation.as}_through.${operation.throughForeignField}`,
							foreignField: operation.foreignField,
							as: `${operation.as}_temp`
						}
					},
					{
						$group: {
							_id: '$_id',
							root: { $first: '$$ROOT' },
							[operation.as]: { $push: { $arrayElemAt: [`$${operation.as}_temp`, 0] } }
						}
					},
					{
						$replaceRoot: {
							newRoot: {
								$mergeObjects: ['$root', { [operation.as]: `$${operation.as}` }]
							}
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0
						}
					}
				);
			}
		}
	});

	return pipeline;
}

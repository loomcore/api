import { Document } from 'mongodb';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { JoinThroughMany } from '../../operations/join-through-many.operation.js';
import { Operation } from '../../operations/operation.js';

export function convertOperationsToPipeline(operations: Operation[]): Document[] {
	let pipeline: Document[] = [];
	const processedOperations: Operation[] = [];

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
			// Use let/pipeline syntax if:
			// 1. foreignField is '_id' (needs ObjectId conversion), OR
			// 2. localField contains '.' (nested field reference from a joined table)
			const needsObjectIdConversion = operation.foreignField === '_id';
			const isNestedField = operation.localField.includes('.');
			
			if (needsObjectIdConversion || isNestedField) {
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
				
				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op => 
						op instanceof Join && op.as === parentAlias
					);
					
					if (parentJoin) {
						// Merge the array into the parent object using $mergeObjects
						pipeline.push({
							$addFields: {
								[parentAlias]: {
									$mergeObjects: [
										`$${parentAlias}`,
										{ [operation.as]: `$${operation.as}` }
									]
								}
							}
						});
						// Remove from root level
						pipeline.push({
							$project: {
								[operation.as]: 0
							}
						});
					}
				}
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
			// One-to-one join through intermediate collection: nested lookup, unwind to single object
			// First lookup the join table, then lookup the target collection
			// Use let/pipeline syntax if:
			// 1. foreignField is '_id' (needs ObjectId conversion), OR
			// 2. localField contains '.' (nested field reference from a joined table)
			const needsObjectIdConversion = operation.foreignField === '_id';
			const isNestedField = operation.localField.includes('.');
			
			if (needsObjectIdConversion || isNestedField) {
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
											$eq: [
												{
													$cond: [
														{ $eq: [{ $type: `$${operation.throughLocalField}` }, 'string'] },
														{ $toObjectId: `$${operation.throughLocalField}` },
														`$${operation.throughLocalField}`
													]
												},
												'$$localId'
											]
										}
									}
								},
								{ $limit: 1 }
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
											$eq: [
												{
													$cond: [
														{ $eq: [{ $type: `$${operation.foreignField}` }, 'string'] },
														{ $toObjectId: `$${operation.foreignField}` },
														`$${operation.foreignField}`
													]
												},
												'$$foreignId'
											]
										}
									}
								}
							],
							as: `${operation.as}_temp`
						}
					},
					{
						$unwind: {
							path: `$${operation.as}_temp`,
							preserveNullAndEmptyArrays: true
						}
					},
					{
						$addFields: {
							[operation.as]: `$${operation.as}_temp`
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0
						}
					}
				);
				
				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op => 
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);
					
					if (parentJoin) {
						// Merge the single object into the parent object using $mergeObjects
						pipeline.push({
							$set: {
								[parentAlias]: {
									$mergeObjects: [
										{ $ifNull: [`$${parentAlias}`, {}] },
										{ [operation.as]: `$${operation.as}` }
									]
								}
							}
						});
						// Remove from root level
						pipeline.push({
							$unset: operation.as
						});
					}
				}
			} else {
				// For non-ObjectId fields, check if we need nested field handling
				const isNestedFieldElse = operation.localField.includes('.');
				
				if (isNestedFieldElse) {
					// Use let/pipeline syntax for nested field references
					pipeline.push(
						{
							$lookup: {
								from: operation.through,
								let: { localId: `$${operation.localField}` },
								pipeline: [
									{
										$match: {
											$expr: {
												$eq: [`$${operation.throughLocalField}`, '$$localId']
											}
										}
									},
									{ $limit: 1 }
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
					);
				}
				
				// Continue with the rest of the JoinThrough pipeline (single object)
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							localField: `${operation.as}_through.${operation.throughForeignField}`,
							foreignField: operation.foreignField,
							as: `${operation.as}_temp`
						}
					},
					{
						$unwind: {
							path: `$${operation.as}_temp`,
							preserveNullAndEmptyArrays: true
						}
					},
					{
						$addFields: {
							[operation.as]: `$${operation.as}_temp`
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0
						}
					}
				);
				
				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object
				if (isNestedFieldElse) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op => 
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);
					
					if (parentJoin) {
						// Merge the single object into the parent object using $mergeObjects
						pipeline.push({
							$addFields: {
								[parentAlias]: {
									$mergeObjects: [
										`$${parentAlias}`,
										{ [operation.as]: `$${operation.as}` }
									]
								}
							}
						});
						// Remove from root level
						pipeline.push({
							$project: {
								[operation.as]: 0
							}
						});
					}
				}
			}
		} else if (operation instanceof JoinThroughMany) {
			// Many-to-many join through intermediate collection: nested lookup, keep as array
			// First lookup the join table, then lookup the target collection
			// Use let/pipeline syntax if:
			// 1. foreignField is '_id' (needs ObjectId conversion), OR
			// 2. localField contains '.' (nested field reference from a joined table)
			const needsObjectIdConversion = operation.foreignField === '_id';
			const isNestedField = operation.localField.includes('.');
			
			if (needsObjectIdConversion || isNestedField) {
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
											$eq: [
												{
													$cond: [
														{ $eq: [{ $type: `$${operation.throughLocalField}` }, 'string'] },
														{ $toObjectId: `$${operation.throughLocalField}` },
														`$${operation.throughLocalField}`
													]
												},
												'$$localId'
											]
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
											$eq: [
												{
													$cond: [
														{ $eq: [{ $type: `$${operation.foreignField}` }, 'string'] },
														{ $toObjectId: `$${operation.foreignField}` },
														`$${operation.foreignField}`
													]
												},
												'$$foreignId'
											]
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
				
				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op => 
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);
					
					if (parentJoin) {
						// Merge the array into the parent object using $mergeObjects
						// Use $ifNull to ensure parentAlias exists, then merge the new field
						pipeline.push({
							$set: {
								[parentAlias]: {
									$mergeObjects: [
										{ $ifNull: [`$${parentAlias}`, {}] },
										{ [operation.as]: `$${operation.as}` }
									]
								}
							}
						});
						// Remove from root level
						pipeline.push({
							$unset: operation.as
						});
					}
				}
			} else {
				// For non-ObjectId fields, check if we need nested field handling
				const isNestedFieldElse = operation.localField.includes('.');
				
				if (isNestedFieldElse) {
					// Use let/pipeline syntax for nested field references
					pipeline.push(
						{
							$lookup: {
								from: operation.through,
								let: { localId: `$${operation.localField}` },
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
					);
				}
				
				// Continue with the rest of the JoinThroughMany pipeline (keep as array)
				pipeline.push(
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
				
				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object
				if (isNestedFieldElse) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op => 
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);
					
					if (parentJoin) {
						// Merge the array into the parent object using $mergeObjects
						pipeline.push({
							$addFields: {
								[parentAlias]: {
									$mergeObjects: [
										`$${parentAlias}`,
										{ [operation.as]: `$${operation.as}` }
									]
								}
							}
						});
						// Remove from root level
						pipeline.push({
							$project: {
								[operation.as]: 0
							}
						});
					}
				}
			}
		}
		
		// Track this operation as processed
		processedOperations.push(operation);
	});

	return pipeline;
}

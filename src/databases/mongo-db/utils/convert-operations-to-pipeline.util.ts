import { Document } from 'mongodb';
import { Join } from '../../operations/join.operation.js';
import { JoinMany } from '../../operations/join-many.operation.js';
import { JoinThrough } from '../../operations/join-through.operation.js';
import { JoinThroughMany } from '../../operations/join-through-many.operation.js';
import { Operation } from '../../operations/operation.js';

/**
 * Resolves a localField path to use _joinData prefix if the parent is a join.
 * For example: "person._id" -> "_joinData.person._id" if person is a join.
 */
function resolveLocalFieldPath(
	localField: string,
	processedOperations: Operation[]
): string {
	if (!localField.includes('.')) {
		return localField;
	}

	const [parentAlias] = localField.split('.');
	const parentJoin = processedOperations.find(op =>
		(op instanceof Join || op instanceof JoinMany || op instanceof JoinThrough || op instanceof JoinThroughMany) &&
		op.as === parentAlias
	);

	if (parentJoin) {
		return `_joinData.${localField}`;
	}

	return localField;
}

export function convertOperationsToPipeline(operations: Operation[]): Document[] {
	let pipeline: Document[] = [];
	const processedOperations: Operation[] = [];

	// Collect all join aliases to initialize _joinData structure
	const joinAliases = operations
		.filter(op => op instanceof Join || op instanceof JoinMany || op instanceof JoinThrough || op instanceof JoinThroughMany)
		.map(op => op.as);

	// Initialize _joinData if there are any joins
	if (joinAliases.length > 0) {
		pipeline.push({
			$set: {
				_joinData: {}
			}
		});
	}

	operations.forEach(operation => {
		if (operation instanceof Join) {
			// One-to-one join: lookup and unwind to single object
			// Check if the foreignField is '_id' (which is always ObjectId in MongoDB)
			// and if the localField value might be a string that needs conversion
			const needsObjectIdConversion = operation.foreignField === '_id';
			const isNestedField = operation.localField.includes('.');
			const resolvedLocalField = resolveLocalFieldPath(operation.localField, processedOperations);

			if (needsObjectIdConversion) {
				// Use $expr with $eq to handle ObjectId conversion for the lookup
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							let: {
								localId: {
									$cond: [
										{ $eq: [{ $type: `$${resolvedLocalField}` }, 'string'] },
										{ $toObjectId: `$${resolvedLocalField}` },
										`$${resolvedLocalField}`
									]
								}
							},
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
							[`_joinData.${operation.as}`]: `$${operation.as}Arr`
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
							localField: resolvedLocalField,
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
							[`_joinData.${operation.as}`]: `$${operation.as}Arr`
						}
					},
					{
						$project: {
							[`${operation.as}Arr`]: 0
						}
					}
				);
			}

			// Handle nested joins - nest within _joinData
			if (isNestedField) {
				const [parentAlias] = operation.localField.split('.');
				const parentJoin = processedOperations.find(op =>
					(op instanceof Join || op instanceof JoinMany || op instanceof JoinThrough || op instanceof JoinThroughMany) && op.as === parentAlias
				);

				if (parentJoin) {
					pipeline.push({
						$set: {
							[`_joinData.${parentAlias}`]: {
								$mergeObjects: [
									{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
									{ [operation.as]: `$_joinData.${operation.as}` }
								]
							}
						}
					});
					pipeline.push({
						$unset: `_joinData.${operation.as}`
					});
				}
			}
		} else if (operation instanceof JoinMany) {
			// Many-to-one join: lookup without unwind (keep as array)
			// Use let/pipeline syntax if:
			// 1. foreignField is '_id' (needs ObjectId conversion), OR
			// 2. localField contains '.' (nested field reference from a joined table)
			const needsObjectIdConversion = operation.foreignField === '_id';
			const isNestedField = operation.localField.includes('.');
			const resolvedLocalField = resolveLocalFieldPath(operation.localField, processedOperations);

			if (needsObjectIdConversion || isNestedField) {
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							let: {
								localId: {
									$cond: [
										{ $eq: [{ $type: `$${resolvedLocalField}` }, 'string'] },
										{ $toObjectId: `$${resolvedLocalField}` },
										`$${resolvedLocalField}`
									]
								}
							},
							pipeline: [
								{
									$match: {
										$expr: {
											$eq: [`$${operation.foreignField}`, '$$localId']
										}
									}
								}
							],
							as: `${operation.as}_temp`
						}
					},
					{
						$addFields: {
							[`_joinData.${operation.as}`]: `$${operation.as}_temp`
						}
					},
					{
						$project: {
							[`${operation.as}_temp`]: 0
						}
					}
				);

				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object in _joinData
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op =>
						(op instanceof Join || op instanceof JoinMany || op instanceof JoinThrough || op instanceof JoinThroughMany) && op.as === parentAlias
					);

					if (parentJoin) {
						// Merge the array into the parent object in _joinData using $mergeObjects
						pipeline.push({
							$set: {
								[`_joinData.${parentAlias}`]: {
									$mergeObjects: [
										{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
										{ [operation.as]: `$_joinData.${operation.as}` }
									]
								}
							}
						});
						// Remove from root level of _joinData
						pipeline.push({
							$unset: `_joinData.${operation.as}`
						});
					}
				}
			} else {
				pipeline.push(
					{
						$lookup: {
							from: operation.from,
							localField: resolvedLocalField,
							foreignField: operation.foreignField,
							as: `${operation.as}_temp`
						}
					},
					{
						$addFields: {
							[`_joinData.${operation.as}`]: `$${operation.as}_temp`
						}
					},
					{
						$project: {
							[`${operation.as}_temp`]: 0
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
			const resolvedLocalField = resolveLocalFieldPath(operation.localField, processedOperations);

			if (needsObjectIdConversion || isNestedField) {
				pipeline.push(
					{
						$lookup: {
							from: operation.through,
							let: {
								localId: {
									$cond: [
										{ $eq: [{ $type: `$${resolvedLocalField}` }, 'string'] },
										{ $toObjectId: `$${resolvedLocalField}` },
										`$${resolvedLocalField}`
									]
								}
							},
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
							let: {
								foreignId: {
									$cond: [
										{ $eq: [{ $type: `$${operation.as}_through.${operation.throughForeignField}` }, 'string'] },
										{ $toObjectId: `$${operation.as}_through.${operation.throughForeignField}` },
										`$${operation.as}_through.${operation.throughForeignField}`
									]
								}
							},
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
							[`_joinData.${operation.as}`]: `$${operation.as}_temp`
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
				// nest the result under that joined object in _joinData
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op =>
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);

					if (parentJoin) {
						// Merge the single object into the parent object in _joinData using $mergeObjects
						pipeline.push({
							$set: {
								[`_joinData.${parentAlias}`]: {
									$mergeObjects: [
										{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
										{ [operation.as]: `$_joinData.${operation.as}` }
									]
								}
							}
						});
						// Remove from root level of _joinData
						pipeline.push({
							$unset: `_joinData.${operation.as}`
						});
					}
				}
			} else {
				// For non-ObjectId fields, check if we need nested field handling
				const isNestedFieldElse = operation.localField.includes('.');
				const resolvedLocalFieldElse = resolveLocalFieldPath(operation.localField, processedOperations);

				if (isNestedFieldElse) {
					// Use let/pipeline syntax for nested field references
					pipeline.push(
						{
							$lookup: {
								from: operation.through,
								let: { localId: `$${resolvedLocalFieldElse}` },
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
								localField: resolvedLocalFieldElse,
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
							[`_joinData.${operation.as}`]: `$${operation.as}_temp`
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
				// nest the result under that joined object in _joinData
				if (isNestedFieldElse) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op =>
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);

					if (parentJoin) {
						// Merge the single object into the parent object in _joinData using $mergeObjects
						pipeline.push({
							$set: {
								[`_joinData.${parentAlias}`]: {
									$mergeObjects: [
										{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
										{ [operation.as]: `$_joinData.${operation.as}` }
									]
								}
							}
						});
						// Remove from root level of _joinData
						pipeline.push({
							$unset: `_joinData.${operation.as}`
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
			const resolvedLocalField = resolveLocalFieldPath(operation.localField, processedOperations);

			if (needsObjectIdConversion || isNestedField) {
				pipeline.push(
					{
						$lookup: {
							from: operation.through,
							let: {
								localId: {
									$cond: [
										{ $eq: [{ $type: `$${resolvedLocalField}` }, 'string'] },
										{ $toObjectId: `$${resolvedLocalField}` },
										`$${resolvedLocalField}`
									]
								}
							},
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
							let: {
								foreignId: {
									$cond: [
										{ $eq: [{ $type: `$${operation.as}_through.${operation.throughForeignField}` }, 'string'] },
										{ $toObjectId: `$${operation.as}_through.${operation.throughForeignField}` },
										`$${operation.as}_through.${operation.throughForeignField}`
									]
								}
							},
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
							[`${operation.as}_temp_grouped`]: { $push: { $arrayElemAt: [`$${operation.as}_temp`, 0] } }
						}
					},
					{
						$replaceRoot: {
							newRoot: {
								$mergeObjects: ['$root', { [`_joinData.${operation.as}`]: `$${operation.as}_temp_grouped` }]
							}
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0,
							[`${operation.as}_temp_grouped`]: 0
						}
					}
				);

				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object in _joinData
				if (isNestedField) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op =>
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);

					if (parentJoin) {
						// Merge the array into the parent object in _joinData using $mergeObjects
						// Use $ifNull to ensure parentAlias exists, then merge the new field
						pipeline.push({
							$set: {
								[`_joinData.${parentAlias}`]: {
									$mergeObjects: [
										{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
										{ [operation.as]: `$_joinData.${operation.as}` }
									]
								}
							}
						});
						// Remove from root level of _joinData
						pipeline.push({
							$unset: `_joinData.${operation.as}`
						});
					}
				}
			} else {
				// For non-ObjectId fields, check if we need nested field handling
				const isNestedFieldElse = operation.localField.includes('.');
				const resolvedLocalFieldElse = resolveLocalFieldPath(operation.localField, processedOperations);

				if (isNestedFieldElse) {
					// Use let/pipeline syntax for nested field references
					pipeline.push(
						{
							$lookup: {
								from: operation.through,
								let: { localId: `$${resolvedLocalFieldElse}` },
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
								localField: resolvedLocalFieldElse,
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
							[`${operation.as}_temp_grouped`]: { $push: { $arrayElemAt: [`$${operation.as}_temp`, 0] } }
						}
					},
					{
						$replaceRoot: {
							newRoot: {
								$mergeObjects: ['$root', { [`_joinData.${operation.as}`]: `$${operation.as}_temp_grouped` }]
							}
						}
					},
					{
						$project: {
							[`${operation.as}_through`]: 0,
							[`${operation.as}_temp`]: 0,
							[`${operation.as}_temp_grouped`]: 0
						}
					}
				);

				// If localField references a nested field (e.g., "person._id"), 
				// nest the result under that joined object in _joinData
				if (isNestedFieldElse) {
					const [parentAlias] = operation.localField.split('.');
					// Find the parent join operation that was already processed
					const parentJoin = processedOperations.find(op =>
						(op instanceof Join || op instanceof JoinThrough) && op.as === parentAlias
					);

					if (parentJoin) {
						// Merge the array into the parent object in _joinData using $mergeObjects
						pipeline.push({
							$set: {
								[`_joinData.${parentAlias}`]: {
									$mergeObjects: [
										{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
										{ [operation.as]: `$_joinData.${operation.as}` }
									]
								}
							}
						});
						// Remove from root level of _joinData
						pipeline.push({
							$unset: `_joinData.${operation.as}`
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

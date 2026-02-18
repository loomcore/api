import { Document } from 'mongodb';
import { LeftJoin } from '../../operations/left-join.operation.js';
import { InnerJoin } from '../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../operations/left-join-many.operation.js';
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
		(op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany) &&
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
		.filter(op => op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany)
		.map(op => op.as);

	// Note: _joinData will be created automatically by MongoDB when we use $addFields
	// We don't initialize it here because MongoDB doesn't allow setting a field to an empty object {}

	operations.forEach(operation => {
		if (operation instanceof LeftJoin || operation instanceof InnerJoin) {
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
							_joinData: {
								$mergeObjects: [
									{ $ifNull: ['$_joinData', {}] },
									{ [operation.as]: `$${operation.as}Arr` }
								]
							}
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
							_joinData: {
								$mergeObjects: [
									{ $ifNull: ['$_joinData', {}] },
									{ [operation.as]: `$${operation.as}Arr` }
								]
							}
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
					(op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany) && op.as === parentAlias
				);

				if (parentJoin) {
					// Merge _joinData at root level to ensure it exists, then set nested field
					pipeline.push({
						$addFields: {
							_joinData: {
								$mergeObjects: [
									{ $ifNull: ['$_joinData', {}] },
									{
										[parentAlias]: {
											$mergeObjects: [
												{
													$ifNull: [
														{
															$getField: {
																field: parentAlias,
																input: { $ifNull: ['$_joinData', {}] }
															}
														},
														{}
													]
												},
												{
													[operation.as]: {
														$getField: {
															field: operation.as,
															input: { $ifNull: ['$_joinData', {}] }
														}
													}
												}
											]
										}
									}
								]
							}
						}
					});
					pipeline.push({
						$unset: `_joinData.${operation.as}`
					});
				}
			}
		} else if (operation instanceof LeftJoinMany) {
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
							_joinData: {
								$mergeObjects: [
									{ $ifNull: ['$_joinData', {}] },
									{ [operation.as]: `$${operation.as}_temp` }
								]
							}
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
						(op instanceof LeftJoin || op instanceof InnerJoin || op instanceof LeftJoinMany) && op.as === parentAlias
					);

					if (parentJoin) {
						// Check if parent is an array (LeftJoinMany) or an object (LeftJoin/InnerJoin)
						if (parentJoin instanceof LeftJoinMany) {
							// When parent is an array, find the grandparent (the object containing the array)
							// by looking for the most recent LeftJoin/InnerJoin before this parentJoin
							const grandparentJoin = processedOperations
								.slice(0, processedOperations.indexOf(parentJoin))
								.reverse()
								.find(op => op instanceof LeftJoin || op instanceof InnerJoin);
							
							if (grandparentJoin) {
								// Nest under grandparent (e.g., clientPerson)
								pipeline.push({
									$addFields: {
										_joinData: {
											$mergeObjects: [
												{ $ifNull: ['$_joinData', {}] },
												{
													[grandparentJoin.as]: {
														$mergeObjects: [
															{ $ifNull: [`$_joinData.${grandparentJoin.as}`, {}] },
															{ 
																[operation.as]: {
																	$ifNull: [`$_joinData.${operation.as}`, []]
																}
															}
														]
													}
												}
											]
										}
									}
								});
							} else {
								// No grandparent found, ensure field exists at root level
								pipeline.push({
									$addFields: {
										_joinData: {
											$mergeObjects: [
												{ $ifNull: ['$_joinData', {}] },
												{
													[operation.as]: {
														$ifNull: [`$_joinData.${operation.as}`, []]
													}
												}
											]
										}
									}
								});
							}
						} else {
							// Parent is an object - merge nested field into it
							pipeline.push({
								$addFields: {
									_joinData: {
										$mergeObjects: [
											{ $ifNull: ['$_joinData', {}] },
											{
												[parentAlias]: {
													$mergeObjects: [
														{ $ifNull: [`$_joinData.${parentAlias}`, {}] },
														{ [operation.as]: { $ifNull: [`$_joinData.${operation.as}`, []] } }
													]
												}
											}
										]
									}
								}
							});
						}
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
							_joinData: {
								$mergeObjects: [
									{ $ifNull: ['$_joinData', {}] },
									{ [operation.as]: `$${operation.as}_temp` }
								]
							}
						}
					},
					{
						$project: {
							[`${operation.as}_temp`]: 0
						}
					}
				);
			}
		}

		// Track this operation as processed
		processedOperations.push(operation);
	});

	return pipeline;
}

import { IQueryOptions, IModelSpec } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { TSchema } from '@sinclair/typebox';
import { Document, ObjectId } from 'mongodb';
import { PROPERTIES_THAT_ARE_NOT_OBJECT_IDS } from './constants.js';
import { getPropertySchema } from './getPropertySchema.js';

export function buildNoSqlMatch(queryOptions: IQueryOptions, modelSpec?: IModelSpec): Document {
	const filters = queryOptions.filters || {};
	const schema = modelSpec?.fullSchema;
	let match: any = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value) {
			const propSchema = schema ? getPropertySchema(key, schema) : undefined;

			if (value.eq !== undefined) {
				const isObjectIdField = propSchema?.format === 'objectid';
				const valueToCompare = value.eq;

				// Use schema to check for ObjectId, otherwise fall back to name-based check
				// Special case for _id: always treat as ObjectId if it's a valid ObjectId string
				if ((key === '_id' || isObjectIdField || (!schema && key.endsWith('Id') && !PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)))
					&& typeof valueToCompare === 'string' && entityUtils.isValidObjectId(valueToCompare)) {
					match[key] = new ObjectId(valueToCompare);
				}

				// Convert numeric strings to numbers
				else if (typeof valueToCompare === 'string' && !isNaN(Number(valueToCompare))) {
					match[key] = Number(valueToCompare);
				}
				else {
					match[key] = valueToCompare;
				}
			}
			else if (value.in !== undefined && Array.isArray(value.in)) {
				const isObjectIdArray = propSchema?.type === 'array' && (propSchema.items as TSchema)?.format === 'objectid';

				// Use schema to check for ObjectId array, otherwise fall back to name-based check
				// Special case for _id: always treat as ObjectId array if values are valid ObjectId strings
				if (key === '_id' || isObjectIdArray || (!schema && (key.endsWith('Id') || key.endsWith('Ids')) && !PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key))) {
					// Convert string values to ObjectIds
					const objectIds = value.in
						.filter(val => typeof val === 'string' && entityUtils.isValidObjectId(val))
						.map(val => new ObjectId(val as string));
					if (objectIds.length > 0) {
						match[key] = { $in: objectIds };
					}
				} else {
					// Convert numeric strings to numbers in arrays
					const convertedValues = value.in.map(val => typeof val === 'string' && !isNaN(Number(val)) ? Number(val) : val
					);
					match[key] = { $in: convertedValues };
				}
			}
			else if (value.gte !== undefined) {
				match[key] = { $gte: value.gte };
			}
			else if (value.lte !== undefined) {
				match[key] = { $lte: value.lte };
			}
			else if (value.gt !== undefined) {
				match[key] = { $gt: value.gt };
			}
			else if (value.lt !== undefined) {
				match[key] = { $lt: value.lt };
			}
			else if (value.contains !== undefined) {
				match[key] = { $regex: value.contains, $options: 'i' };
			}
		}
	}

	return { $match: match };
}

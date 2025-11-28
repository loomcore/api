import { entityUtils } from '@loomcore/common/utils';
import { TSchema } from '@sinclair/typebox';
import _ from 'lodash';
import { ObjectId } from 'mongodb';
import { PROPERTIES_THAT_ARE_NOT_OBJECT_IDS } from '../../models/constants.js';
import { IEntity } from '@loomcore/common/models';

/**
 * Converts strings to MongoDB ObjectIds based on TypeBox schema definition
 * @param entity API model to be saved to MongoDB
 * @param schema TypeBox schema with TypeboxObjectId fields
 * @returns Entity with strings converted to ObjectIds for MongoDB operations
 */
export function convertStringsToObjectIds<U extends IEntity | Partial<IEntity>>(entity: U, schema: TSchema): U {
	if (!entity) return entity;

	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(entity) as any;

	// Manually check for and convert _id at the root level, as it's not part of the schema properties
	if (clone._id && typeof clone._id === 'string' && entityUtils.isValidObjectId(clone._id)) {
		clone._id = new ObjectId(clone._id as string);
	}

	// Extract object id fields from schema and process the entity
	const processEntity = (obj: any, subSchema: TSchema, path: string[] = []): any => {
		// If not an object or null, nothing to process
		if (!obj || typeof obj !== 'object') return obj;

		// Handle Date objects - preserve them
		if (obj instanceof Date) {
			return obj;
		}

		// Handle 'allOf' schema composition (from Type.Intersect)
		if (subSchema.allOf && Array.isArray(subSchema.allOf)) {
			// Make a copy of the object to work with
			let result = { ...obj };

			// Process each schema in the allOf array
			for (const nestedSchema of subSchema.allOf) {
				result = processEntity(result, nestedSchema, path);
			}

			return result;
		}

		// Handle arrays
		if (Array.isArray(obj)) {
			// Get the schema for array items
			const items = subSchema.items as TSchema;
			if (!items) return obj; // No schema for items, return as is


			// If array of ObjectIds (items has objectid format)
			if (items.format === 'objectid') {
				// Skip properties that shouldn't be treated as ObjectIds
				if (path.length === 1 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(path[0])) {
					return obj;
				}

				// Convert each string to ObjectId
				return obj.map(item => {
					if (typeof item === 'string' && entityUtils.isValidObjectId(item)) {
						return new ObjectId(item);
					}
					return item;
				});
			}

			// For array of objects, process each item
			if (items.type === 'object') {
				return obj.map((item: any, index: number): any => processEntity(item, items, [...path, index.toString()])
				);
			}

			// For other array types, return as is
			return obj;
		}

		// Process object properties
		const result: any = { ...obj };

		// Schema is an object with properties
		if (subSchema.type === 'object' && subSchema.properties) {
			for (const [key, propSchema] of Object.entries(subSchema.properties)) {
				if (!propSchema || typeof propSchema !== 'object' || result[key] === null || result[key] === undefined) {
					continue;
				}

				const typedPropSchema = propSchema as TSchema;
				const fullPath = [...path, key];
				const value = result[key];

				// Check if this property should be an ObjectId (has objectid format)
				const isObjectIdField = typedPropSchema.format === 'objectid';

				// Skip properties that shouldn't be treated as ObjectIds
				if (isObjectIdField && path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
					continue;
				}

				// Convert string to ObjectId if property is defined as objectid format
				if (isObjectIdField && typeof value === 'string' && entityUtils.isValidObjectId(value)) {
					result[key] = new ObjectId(value);
				}

				// Process arrays
				else if (typedPropSchema.type === 'array' && Array.isArray(value)) {
					result[key] = processEntity(value, typedPropSchema, fullPath);
				}

				// Process nested objects
				else if (typedPropSchema.type === 'object' && typeof value === 'object' && !Array.isArray(value)) {
					result[key] = processEntity(value, typedPropSchema, fullPath);
				}
			}
		}

		return result;
	};

	// Process the entity using the schema and return result
	return processEntity(clone, schema);
}

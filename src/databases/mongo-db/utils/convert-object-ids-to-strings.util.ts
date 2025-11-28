import _ from 'lodash';
import { ObjectId } from 'mongodb';

/**
 * SCHEMA-DRIVEN CONVERSION FUNCTIONS
 * These functions use TypeBox schemas to determine which fields need conversion
 */
/**
 * Converts MongoDB ObjectIds to strings based on TypeBox schema definition
 * @param entity Entity from MongoDB to be used in API
 * @param schema TypeBox schema with TypeboxObjectId fields
 * @returns Entity with ObjectIds converted to strings
 */
export function convertObjectIdsToStrings<T>(entity: T): T {
	if (!entity) return entity;

	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(entity);

	// Traverse entity properties instead of schema properties
	const processEntity = (obj: any): any => {
		// Handle null/undefined
		if (!obj) return obj;

		// Handle ObjectId - convert to string immediately
		if (obj instanceof ObjectId) {
			return obj.toString();
		}

		// Handle Date objects - preserve them
		if (obj instanceof Date) {
			return obj;
		}

		// Handle arrays - iterate through elements
		if (Array.isArray(obj)) {
			return obj.map(item => processEntity(item));
		}

		// Handle objects - iterate through properties
		if (typeof obj === 'object') {
			const result: any = { ...obj };
			for (const key of Object.keys(result)) {
				const value = result[key];
				if (value !== null && value !== undefined) {
					result[key] = processEntity(value);
				}
			}
			return result;
		}

		// For primitives, return as is
		return obj;
	};

	// Process the entity and return result
	return processEntity(clone);
}

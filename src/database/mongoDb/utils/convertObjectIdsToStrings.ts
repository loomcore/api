import { TSchema } from '@sinclair/typebox';
import _ from 'lodash';
import { ObjectId } from 'mongodb';
import { PROPERTIES_THAT_ARE_NOT_OBJECT_IDS } from '../../models/constants.js';

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
export function convertObjectIdsToStrings<T>(entity: T, schema?: TSchema): T {
	if (!entity) return entity;

	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(entity);

	// If no schema provided, just handle the _id field (legacy behavior)
	if (!schema) {
		// Basic fallback for when schema isn't provided - just handle _id
		if ((clone as any)._id && (clone as any)._id instanceof ObjectId) {
			(clone as any)._id = (clone as any)._id.toString();
		}
		return clone;
	}

	// Extract object id fields from schema
	const processEntity = (obj: any, subSchema: TSchema, path: string[] = []) => {
		// If not an object or null, nothing to process
		if (!obj || typeof obj !== 'object') return;

		// Handle 'allOf' schema composition (from Type.Intersect)
		if (subSchema.allOf && Array.isArray(subSchema.allOf)) {
			// Process each schema in the allOf array
			for (const nestedSchema of subSchema.allOf) {
				processEntity(obj, nestedSchema, path);
			}
			return;
		}

		// Schema is an object with properties
		if (subSchema.type === 'object' && subSchema.properties) {
			for (const [key, propSchema] of Object.entries(subSchema.properties)) {
				if (!propSchema || typeof propSchema !== 'object') continue;

				const typedPropSchema = propSchema as TSchema;
				const fullPath = [...path, key];

				// If this is an ObjectId field
				if (typedPropSchema.format === 'objectid') {
					// Skip properties that shouldn't be treated as ObjectIds
					if (path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
						continue;
					}

					// Convert ObjectId to string
					if (obj[key] instanceof ObjectId) {
						obj[key] = obj[key].toString();
					}
				}

				// Process nested object
				else if (typedPropSchema.type === 'object' && obj[key]) {
					processEntity(obj[key], typedPropSchema, fullPath);
				}

				// Process array
				else if (typedPropSchema.type === 'array' && Array.isArray(obj[key])) {
					const items = typedPropSchema.items as TSchema;

					// Process each item in the array
					if (items) {
						for (let i = 0; i < obj[key].length; i++) {
							// If array of ObjectIds
							if (items.format === 'objectid') {
								// Skip properties that shouldn't be treated as ObjectIds
								if (path.length === 0 && PROPERTIES_THAT_ARE_NOT_OBJECT_IDS.includes(key)) {
									continue;
								}

								if (obj[key][i] instanceof ObjectId) {
									obj[key][i] = obj[key][i].toString();
								}
							}

							// If array of objects, process each object
							else if (items.type === 'object') {
								processEntity(obj[key][i], items, [...fullPath, i.toString()]);
							}
						}
					}
				}
			}
		}
	};

	// Process the entity using the schema
	processEntity(clone, schema);
	return clone;
}

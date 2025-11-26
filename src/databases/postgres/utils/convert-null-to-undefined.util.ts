import { TSchema } from '@sinclair/typebox';
import _ from 'lodash';

/**
 * Checks if a property is optional in a TypeBox schema.
 * A property is optional if it's not in the required array.
 * For allOf schemas, a property is required if it's required in ANY of the schemas.
 * @param key The property name
 * @param schema The TypeBox schema
 * @returns True if the property is optional
 */
function isPropertyOptional(key: string, schema: TSchema): boolean {
	if (!schema || typeof schema !== 'object') return false;

	// Handle 'allOf' for schema compositions (e.g., Type.Intersect)
	if (schema.allOf && Array.isArray(schema.allOf)) {
		// A property is required if it's required in ANY of the allOf schemas
		for (const nestedSchema of schema.allOf) {
			if (!isPropertyOptional(key, nestedSchema)) {
				return false; // Required in at least one schema
			}
		}
		return true; // Optional in all schemas
	}

	// Check for property in the current schema level
	if (schema.type === 'object' && schema.properties && schema.properties[key]) {
		const required = schema.required || [];
		return !required.includes(key);
	}

	return false;
}

/**
 * Converts null values to undefined for optional properties in postgres query results.
 * This function recursively processes objects and arrays based on the TypeBox schema.
 * @param data The query result (single object or array of objects)
 * @param schema The TypeBox schema to determine which properties are optional
 * @returns The processed data with null values converted to undefined for optional properties
 */
export function convertNullToUndefined<T>(data: T, schema: TSchema): T {
	if (!data || !schema) return data;

	// Handle arrays
	if (Array.isArray(data)) {
		return data.map(item => convertNullToUndefined(item, schema)) as T;
	}

	// If not an object, return as-is
	if (typeof data !== 'object' || data === null) {
		return data;
	}

	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(data);

	// Process the object recursively
	const processObject = (obj: any, subSchema: TSchema) => {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;

		// Handle 'allOf' schema composition (e.g., Type.Intersect)
		if (subSchema.allOf && Array.isArray(subSchema.allOf)) {
			// Process each schema in the allOf array
			for (const nestedSchema of subSchema.allOf) {
				processObject(obj, nestedSchema);
			}
			return;
		}

		// Schema is an object with properties
		if (subSchema.type === 'object' && subSchema.properties) {
			for (const [key, propSchema] of Object.entries(subSchema.properties)) {
				if (!propSchema || typeof propSchema !== 'object') continue;

				const typedPropSchema = propSchema as TSchema;
				const value = obj[key];

				// Check if property is optional
				if (isPropertyOptional(key, subSchema)) {
					// If optional and value is null, delete the property
					if (value === null) {
						delete obj[key];
					}
				}

				// Process nested object
				if (typedPropSchema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
					processObject(value, typedPropSchema);
				}

				// Process array
				if (typedPropSchema.type === 'array' && Array.isArray(value)) {
					const items = typedPropSchema.items as TSchema;
					if (items) {
						for (let i = 0; i < value.length; i++) {
							// If array of objects, process each object recursively
							if (items.type === 'object' && value[i] && typeof value[i] === 'object' && !Array.isArray(value[i])) {
								processObject(value[i], items);
							}
							// If array of arrays, process recursively
							else if (items.type === 'array' && Array.isArray(value[i])) {
								value[i] = convertNullToUndefined(value[i], items);
							}
						}
					}
				}
			}
		}
	};

	// Process the data using the schema
	processObject(clone, schema);
	return clone;
}


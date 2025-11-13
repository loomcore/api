import { TSchema } from '@sinclair/typebox';

/**
 * Retrieves the schema for a specific property from a TypeBox schema, handling compositions like 'allOf'.
 * @param key The name of the property
 * @param schema The TypeBox schema to search within
 * @returns The schema for the property, or undefined if not found
 */

export function getPropertySchema(key: string, schema: TSchema): TSchema | undefined {
	if (!schema || typeof schema !== 'object') return undefined;

	// Handle 'allOf' for schema compositions (e.g., Type.Intersect)
	if (schema.allOf && Array.isArray(schema.allOf)) {
		for (const nestedSchema of schema.allOf) {
			const propSchema = getPropertySchema(key, nestedSchema);
			if (propSchema) return propSchema;
		}
	}

	// Check for property in the current schema level
	if (schema.type === 'object' && schema.properties) {
		return schema.properties[key] as TSchema | undefined;
	}

	return undefined;
}

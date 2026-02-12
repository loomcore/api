import _ from 'lodash';

/**
 * Converts a camelCase string to snake_case
 * @param str The string to convert
 * @returns The snake_case version of the string
 */
export function toSnakeCase(str: string): string {
	// Handle camelCase transitions: insert underscore before uppercase letters
	let result = str.replace(/([a-z])([A-Z])/g, '$1_$2');
	
	// Convert to lowercase and replace spaces or hyphens with underscores
	result = result.toLowerCase()
		.replace(/[\s-]/g, '_');
	
	// Cleanup: handle consecutive underscores or leading/trailing underscores
	result = result.replace(/_+/g, '_') // Replace multiple consecutive underscores with one
		.replace(/^_|_$/g, ''); // Remove underscores at the start or end
	
	return result;
}

/**
 * Converts a snake_case string to camelCase
 * @param str The string to convert
 * @returns The camelCase version of the string
 */
export function toCamelCase(str: string): string {
	// Split by underscores and hyphens
	return str.split(/[-_]+/)
		.map((word, index) => {
			// First word is lowercase, subsequent words are capitalized
			if (index === 0) {
				return word.toLowerCase();
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join('');
}

/**
 * Recursively converts all object keys from camelCase to snake_case
 * @param obj The object to convert
 * @returns A new object with snake_case keys
 */
export function convertKeysToSnakeCase<T>(obj: T): T {
	if (!obj) return obj;
	
	// Handle arrays
	if (Array.isArray(obj)) {
		return obj.map(item => convertKeysToSnakeCase(item)) as T;
	}
	
	// Handle Date objects - preserve them
	if (obj instanceof Date) {
		return obj;
	}
	
	// Handle primitives and null
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}
	
	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(obj);
	const result: any = {};
	
	// Process each key-value pair
	for (const [key, value] of Object.entries(clone)) {
		// Leave keys starting with underscore unchanged
		const snakeKey = key.startsWith('_') ? key : toSnakeCase(key);
		
		// Recursively process nested objects and arrays
		if (value !== null && value !== undefined) {
			if (Array.isArray(value)) {
				result[snakeKey] = value.map(item => convertKeysToSnakeCase(item));
			} else if (typeof value === 'object' && !(value instanceof Date)) {
				result[snakeKey] = convertKeysToSnakeCase(value);
			} else {
				result[snakeKey] = value;
			}
		} else {
			result[snakeKey] = value;
		}
	}
	
	return result as T;
}

/**
 * Recursively converts all object keys from snake_case to camelCase
 * @param obj The object to convert
 * @returns A new object with camelCase keys
 */
export function convertKeysToCamelCase<T>(obj: T): T {
	if (!obj) return obj;
	
	// Handle arrays
	if (Array.isArray(obj)) {
		return obj.map(item => convertKeysToCamelCase(item)) as T;
	}
	
	// Handle Date objects - preserve them
	if (obj instanceof Date) {
		return obj;
	}
	
	// Handle primitives and null
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}
	
	// Create a deep clone to avoid modifying the original
	const clone = _.cloneDeep(obj);
	const result: any = {};
	
	// Process each key-value pair
	for (const [key, value] of Object.entries(clone)) {
		// Leave keys starting with underscore unchanged
		const camelKey = key.startsWith('_') ? key : toCamelCase(key);
		
		// Recursively process nested objects and arrays
		if (value !== null && value !== undefined) {
			if (Array.isArray(value)) {
				result[camelKey] = value.map(item => convertKeysToCamelCase(item));
			} else if (typeof value === 'object' && !(value instanceof Date)) {
				result[camelKey] = convertKeysToCamelCase(value);
			} else {
				result[camelKey] = value;
			}
		} else {
			result[camelKey] = value;
		}
	}
	
	return result as T;
}

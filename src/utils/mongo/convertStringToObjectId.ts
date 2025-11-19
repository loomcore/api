import { entityUtils } from '@loomcore/common/utils';
import { ObjectId } from 'mongodb';

/**
 * Converts string ID to MongoDB ObjectId for database operations
 * @param value The value to convert
 * @returns ObjectId instance or the original value if conversion not possible
 */
export function convertStringToObjectId(value: any): any {
	// If it's already an ObjectId, return it
	if (value instanceof ObjectId) {
		return value;
	}

	// If it's null or undefined, return as is
	if (value === null || value === undefined) {
		return value;
	}

	// If it's a string and looks like a valid ObjectId, convert it
	if (typeof value === 'string' && entityUtils.isValidObjectId(value)) {
		try {
			return new ObjectId(value);
		} catch (error) {
			console.warn(`Failed to convert string "${value}" to ObjectId:`, error);
			return value; // Return original if conversion fails
		}
	}

	// For all other cases, return the value as is
	return value;
}

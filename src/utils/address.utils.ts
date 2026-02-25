import { IAddressModel } from '@loomcore/common/models';

/**
 * Checks if a value is effectively empty (null, undefined, or whitespace only)
 * @param value The value to check
 * @returns True if the value is null, undefined, or contains only whitespace
 */
function isEmptyValue(value: any): boolean {
	let result = false;

	if (value === null || value === undefined) {
		result = true;
	} else if (typeof value === 'string' && value.trim() === '') {
		result = true;
	}

	return result;
}

/**
 * Standardizes an address field by trimming whitespace and converting to uppercase
 * Returns null for effectively empty values (null, undefined, whitespace only)
 * @param field The address field to standardize
 * @returns Standardized field value or null if field is effectively empty
 */
function standardizeField(field: string | undefined | null): string | null {
	let result = null;

	if (!isEmptyValue(field)) {
		const standardized = field!.trim().toUpperCase();
		if (standardized.length > 0) {
			result = standardized;
		}
	}

	return result;
}

/**
 * Creates a single line address from an IAddress object
 * Handles null/undefined/whitespace values properly
 * @param address The address to convert to a single line
 * @returns A standardized single line address or null if essential parts are missing
 */
function getSingleLineAddress(address: IAddressModel): string | null {
	let result = null;

	if (address) {
		// Standardize all fields
		const street = standardizeField(address.address1);
		const address2 = standardizeField(address.address2);
		const address3 = standardizeField(address.address3);
		const city = standardizeField(address.city);
		const state = standardizeField(address.state);
		const postalCode = standardizeField(address.postalCode);

		// If we don't have at least street, city and postalCode, return null
		if (street && city && postalCode) {
			// Build address parts without postal code
			let parts = [street];

			if (address2) {
				parts.push(address2);
			}

			if (address3) {
				parts.push(address3);
			}

			parts.push(city);

			// Handle state and postal code with special formatting
			// State and postal code are separated by space, not comma
			let statePostalPart = state;
			statePostalPart += ' ' + postalCode;
			parts.push(statePostalPart!);

			result = parts.join(', ');
		}
	}

	return result;
}

/**
 * Updates an address object to include a formattedAddress property
 * @param address The address to update
 * @returns The updated address with formattedAddress or the original address if formatting fails
 */
function addFormattedAddress(address: IAddressModel): IAddressModel {
	const formattedAddress = getSingleLineAddress(address);

	if (formattedAddress) {
		return {
			...address,
			formattedAddress
		};
	}

	return address;
}

export const addressUtils = {
	getSingleLineAddress,
	standardizeField,
	addFormattedAddress
};

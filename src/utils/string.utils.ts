function camelCase(str: string) {
	// Split the string into words, considering spaces, hyphens, and underscores as word separators
	return str.split(/[\s-_]+|(?=[A-Z])/)
		.map((word, index) => {
			// If it's the first word, convert only the first character to lowercase, otherwise capitalize the first letter
			if (index === 0) {
				return word.charAt(0).toLowerCase() + word.slice(1);
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join(''); // Join the words back into a single string
}

function pascalCase(str: string) {
	// // Split the string into words, considering both underscores and hyphens as word separators
	// return str.split(/[-_]/)
	// .map(word => {
	//   // Capitalize the first letter of each word and make the rest lowercase
	//   return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
	// })
	// .join(''); // Join the words back into a single string
	// Split the string into words, considering both underscores and hyphens as word separators
	return str.split(/[-_]/)
		.map(word => {
			// Capitalize the first letter of each word
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(''); // Join the words back into a single string
}

function kebabCase(str: string) {
	// First, we handle camelCase transitions
	let result = str.replace(/([a-z])([A-Z])/g, '$1-$2');

	// Then convert to lowercase and replace spaces or underscores with hyphens
	result = result.toLowerCase()
		.replace(/[ _]/g, '-')

	// Cleanup: handle consecutive hyphens or leading/trailing hyphens
	result = result.replace(/-{2,}/g, '-') // Replace two or more consecutive hyphens with one
		.replace(/^-|-$/g, ''); // Remove hyphens at the start or end of the string

	return result;
}

export const stringUtils = {
	camelCase,
	pascalCase,
	kebabCase
}


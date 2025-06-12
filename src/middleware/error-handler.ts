import { Request, Response, NextFunction } from 'express';
import {CustomError} from '@loomcore/common/errors';
import {apiUtils} from '../utils/index.js';
import { config } from '../config/base-api-config.js';

/**
 * List of property names considered sensitive
 */
const SENSITIVE_FIELDS = [
	'password',
	'token',
	'apiKey',
	'secret',
	'credit_card',
	'creditCard',
	'ssn',
	'email',
	'phone',
	'address'
];

/**
 * Sanitize data by replacing sensitive information with asterisks
 */
const sanitizeData = (data: any): any => {
	if (!data || typeof data !== 'object') {
		return data;
	}

	// Handle arrays
	if (Array.isArray(data)) {
		return data.map(item => sanitizeData(item));
	}

	// Handle objects
	const sanitized = {...data};
	for (const key in sanitized) {
		if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
			sanitized[key] = '********';
		} else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
			sanitized[key] = sanitizeData(sanitized[key]);
		}
	}

	return sanitized;
};

// this is used as an error handler by express because we accept all five parameters in our handler
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
	// todo: review this logging
	if (config.debug?.showErrors || config.env !== 'test') {
		console.error('API Error:', {
			error: err.message,
			stack: err.stack,
			path: req.path,
			method: req.method,
			body: sanitizeData(req.body),
			query: sanitizeData(req.query),
			params: sanitizeData(req.params),
			timestamp: new Date().toISOString(),
			// Add debugging info
			errorType: err.constructor.name,
			isCustomError: err instanceof CustomError,
			// Add request headers if needed
			headers: sanitizeData(req.headers)
		});
	}

	if (err instanceof CustomError) {
		apiUtils.apiResponse(res, err.statusCode, {
			errors: err.serializeErrors()
		});
	}
	else {
		apiUtils.apiResponse(res, 500, {
			errors: [{ message: 'Server Error' }]
		});
	}
};


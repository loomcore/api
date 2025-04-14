import { Request, Response, NextFunction } from 'express';
import {CustomError} from '../errors/index.js';
import {apiUtils} from '../utils/index.js';

// this is used as an error handler by express because we accept all five parameters in our handler
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
	// todo: review this logging
	if (process.env.NODE_ENV !== 'test') {
		console.error('API Error:', {
			error: err.message,
			stack: err.stack,
			path: req.path,
			method: req.method,
			body: req.body,
			query: req.query,
			params: req.params,
			timestamp: new Date().toISOString(),
			// Add debugging info
			errorType: err.constructor.name,
			isCustomError: err instanceof CustomError,
			// Add request headers if needed
			headers: req.headers
		});
	}

	if (err instanceof CustomError) {
		return apiUtils.apiResponse(res, err.statusCode, {
			errors: err.serializeErrors()
		});
	}

	return apiUtils.apiResponse(res, 500, {
		errors: [{ message: 'Server Error' }]
	});
};


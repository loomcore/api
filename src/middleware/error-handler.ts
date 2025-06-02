import { Request, Response, NextFunction } from 'express';
import {CustomError} from '@loomcore/common/errors';
import {apiUtils} from '../utils/index.js';
import { config } from '../config/base-api-config.js';

// this is used as an error handler by express because we accept all five parameters in our handler
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
	// todo: review this logging
	if (config.debug?.showErrors || config.env !== 'test') {
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


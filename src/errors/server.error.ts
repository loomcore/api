import {CustomError} from './custom.error.js';

export class ServerError extends CustomError {
	statusCode = 500;

	constructor(message: string) {
		super(message);

		Object.setPrototypeOf(this, ServerError.prototype);
	}

	serializeErrors(): { message: string; field?: string | undefined; }[] {
		return [{ message: this.message }]
	}

}

import {CustomError} from './custom.error.js';

export class NotFoundError extends CustomError {
    statusCode = 404;

    constructor(message?: string) {
			const errorMessage = message ? message : 'Not Found';
      super(errorMessage);

      // Only needed because we are extending a built-in class
      Object.setPrototypeOf(this, NotFoundError.prototype);
    }

    serializeErrors(): { message: string; field?: string | undefined; }[] {
        return [{ message: this.message }];
    }
}

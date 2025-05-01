import {CustomError} from '@loomcore/common/errors';

export class BadRequestError extends CustomError {
    statusCode = 400;

    constructor(message: string) {
      super(message);

      Object.setPrototypeOf(this, BadRequestError.prototype);
      
      Error.captureStackTrace(this, BadRequestError);
    }

    serializeErrors(): { message: string; field?: string | undefined; }[] {
      return [{ message: this.message }]
    }

}

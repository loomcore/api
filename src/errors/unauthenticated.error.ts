import {CustomError} from './custom.error.js';

export class UnauthenticatedError extends CustomError {
  statusCode = 401;

  constructor() {
    super('Unauthenticated');

    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }

  serializeErrors() {
    return [{ message: 'Unauthenticated' }];
  }
}

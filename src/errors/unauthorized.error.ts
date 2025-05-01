import {CustomError} from '@loomcore/common/errors';

export class UnauthorizedError extends CustomError {
  statusCode = 403;

  constructor() {
    super('Unauthorized');

    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  serializeErrors() {
    return [{ message: 'Unauthorized' }];
  }
}

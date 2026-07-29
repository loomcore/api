import {CustomError} from '@loomcore/common/errors';

export class UnauthorizedError extends CustomError {
  statusCode = 403;

  constructor(missing?: string[]) {
    super(
      missing?.length
        ? `Missing required feature(s): ${missing.join(', ')}`
        : 'Unauthorized',
    );

    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

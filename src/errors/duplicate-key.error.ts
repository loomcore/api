import {CustomError} from '@loomcore/common/errors';

export class DuplicateKeyError extends CustomError {
  statusCode = 400;

  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, DuplicateKeyError.prototype);
  }

  serializeErrors(): { message: string; field?: string | undefined; }[] {
    return [{ message: this.message }]
  }
}

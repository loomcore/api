import {IApiError} from '../models/api-error.interface.js';

export abstract class CustomError extends Error {
  abstract statusCode: number;

  protected constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, CustomError.prototype);
  }

  abstract serializeErrors(): IApiError[];
}

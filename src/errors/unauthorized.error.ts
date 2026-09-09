import { CustomError } from '@loomcore/common/errors';

export class UnauthorizedError extends CustomError {
  statusCode = 403;

  constructor(missingFeatures?: string[], denyOnImpersonation?: boolean) {
    super(
      denyOnImpersonation
        ? 'Unauthorized: Endpoint requires non-impersonated user.'
        : missingFeatures?.length
          ? `Unauthorized: Missing required feature(s): ${missingFeatures.join(', ')}`
          : 'Unauthorized',
    );

    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

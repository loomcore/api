import {CustomError} from './custom.error.js';
import { ValueError } from '@sinclair/typebox/errors';

export class ValidationError extends CustomError {
  statusCode = 400;
  protected validationError: any;

  constructor(validationError: any) {
    // TypeBox errors are an array of ValueError objects
    if (Array.isArray(validationError)) {
      super(validationError[0]?.message || 'Validation Error');
    }
    else {
      super('Validation Error');
    }
    this.validationError = validationError;
    
    
    // Set prototype
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  serializeErrors(): { message: string; field?: string | undefined; }[] {
    // If it's a TypeBox error (array of ValueError objects)
    if (Array.isArray(this.validationError)) {
      return this.validationError.map((error: ValueError) => {
        return {
          message: error.message,
          field: error.path.slice(1) // Remove the leading / from the path that TypeBox adds
        };
      });
    }
    
    // Fallback for other validation errors
    return [{ message: 'Validation Error' }];
  }
}

// example Joi.ValidationError with 2 errors...
// {
//   "value": {
//     "email": "yourmom",
//     "password": "te",
//     "orgId": "999"
//   },
//   "error": {
//     "_original": {
//       "email": "yourmom",
//       "password": "te",
//       "orgId": "999"
//     },
//     "details": [
//     {
//       "message": "\"email\" must be a valid email",
//       "path": [
//         "email"
//       ],
//       "type": "string.email",
//       "context": {
//         "value": "yourmom",
//         "invalids": [
//           "yourmom"
//         ],
//         "label": "email",
//         "key": "email"
//       }
//     },
//     {
//       "message": "\"password\" length must be at least 4 characters long",
//       "path": [
//         "password"
//       ],
//       "type": "string.min",
//       "context": {
//         "limit": 4,
//         "value": "te",
//         "label": "password",
//         "key": "password"
//       }
//     }
//   ]
// }

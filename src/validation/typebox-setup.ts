import { StaticDecode, StaticEncode, TSchema, Type } from '@sinclair/typebox';
import { ObjectId } from 'mongodb';
import { DefaultErrorFunction, ErrorFunctionParameter, ValueErrorType, SetErrorFunction } from '@sinclair/typebox/errors'
import { Kind } from '@sinclair/typebox'
import { FormatRegistry } from '@sinclair/typebox'
import { IsDateTime } from './formats/date-time.js'
import { IsDate } from './formats/date.js'
// Import our extensions to ensure they're initialized
import './typebox-extensions.js';
import { Value } from '@sinclair/typebox/value';
import { IsEmail } from './formats/email.js';


// Custom objectId validator function
export const isValidObjectId = (value: string): boolean => {
  try {
    return ObjectId.isValid(value) && 
           new ObjectId(value).toString() === value;
  } 
  catch {
    return false;
  }
};

// Can be used to add custom validations when creating schemas
// e.g., Type.String({ format: 'objectId' })
// Type.Unsafe({ kind: 'ObjectIdString', type: 'string', format: 'objectId' });

// Initialize function to be called on application startup
export const initializeTypeBox = () => {
  // Configure TypeBox error messages
  SetErrorFunction(customSetErrorFunction);
  
  // Register custom format validators
  // FormatRegistry.Set('objectId', isValidObjectId); // currently just using actual ObjectId types instead of strings with format: 'objectId'
  FormatRegistry.Set('date-time', value => IsDateTime(value));
  FormatRegistry.Set('date', value => IsDate(value));
  FormatRegistry.Set('email', value => IsEmail(value));
}; 


// Example usage of the IsoDateTransform transform functions...
// Check it (validation)
// const R = Value.Check(IsoDateTransform, '2024-04-30T08:54:33.666Z') // true

// Decode it (converts from string to Date object)
// const D = Value.Decode(IsoDateTransform, '2024-04-30T08:54:33.666Z') // Date(2024-04-30T08:54:33.666Z)

// Encode it (converts from Date object to string)
// const E = Value.Encode(IsoDateTransform, D)                          // '2024-04-30T08:54:33.666Z'

// ------------------------------------------------------------------
// Overrides TypeBox Error Message Generation
// ------------------------------------------------------------------
const customSetErrorFunction = (error: ErrorFunctionParameter) => {
  const formattedPath = error.path === '' ? 'value' : error.path
  // Use schema.title if available, otherwise use formattedPath
  const fieldName = error.schema.title || formattedPath
  switch (error.errorType) {
    case ValueErrorType.ArrayContains:
      return `${fieldName} must be an error to contain at least one matching value`
    case ValueErrorType.ArrayMaxContains:
      return `${fieldName} must contain no more than ${error.schema.maxContains} matching values`
    case ValueErrorType.ArrayMinContains:
      return `${fieldName} must contain at least ${error.schema.minContains} matching values`
    case ValueErrorType.ArrayMaxItems:
      return `${fieldName} length to be less or equal to ${error.schema.maxItems}`
    case ValueErrorType.ArrayMinItems:
      return `${fieldName} length to be greater or equal to ${error.schema.minItems}`
    case ValueErrorType.ArrayUniqueItems:
      return `${fieldName} elements must be unique`
    case ValueErrorType.Array:
      return `${fieldName} must be an array`
    case ValueErrorType.AsyncIterator:
      return `${fieldName} must be an AsyncIterator`
    case ValueErrorType.BigIntExclusiveMaximum:
      return `${fieldName} value must be less than ${error.schema.exclusiveMaximum}`
    case ValueErrorType.BigIntExclusiveMinimum:
      return `${fieldName} value must be greater than ${error.schema.exclusiveMinimum}`
    case ValueErrorType.BigIntMaximum:
      return `${fieldName} value must be less or equal to ${error.schema.maximum}`
    case ValueErrorType.BigIntMinimum:
      return `${fieldName} value must be greater or equal to ${error.schema.minimum}`
    case ValueErrorType.BigIntMultipleOf:
      return `${fieldName} value must be a multiple of ${error.schema.multipleOf}`
    case ValueErrorType.BigInt:
      return `${fieldName} must be bigint`
    case ValueErrorType.Boolean:
      return `${fieldName} must be boolean`
    case ValueErrorType.DateExclusiveMinimumTimestamp:
      return `${fieldName} Date must be greater than ${error.schema.exclusiveMinimumTimestamp}`
    case ValueErrorType.DateExclusiveMaximumTimestamp:
      return `${fieldName} Date must be less than ${error.schema.exclusiveMaximumTimestamp}`
    case ValueErrorType.DateMinimumTimestamp:
      return `${fieldName} Date timestamp must be greater or equal to ${error.schema.minimumTimestamp}`
    case ValueErrorType.DateMaximumTimestamp:
      return `${fieldName} Date timestamp must be less or equal to ${error.schema.maximumTimestamp}`
    case ValueErrorType.DateMultipleOfTimestamp:
      return `${fieldName} Date timestamp must be a multiple of ${error.schema.multipleOfTimestamp}`
    case ValueErrorType.Date:
      return `${fieldName} must be a Date`
    case ValueErrorType.Function:
      return `${fieldName} must be a function`
    case ValueErrorType.IntegerExclusiveMaximum:
      return `${fieldName} must be less than ${error.schema.exclusiveMaximum}`
    case ValueErrorType.IntegerExclusiveMinimum:
      return `${fieldName} must be greater than ${error.schema.exclusiveMinimum}`
    case ValueErrorType.IntegerMaximum:
      return `${fieldName} must be less than or equal to ${error.schema.maximum}`
    case ValueErrorType.IntegerMinimum:
      return `${fieldName} must be greater than or equal to ${error.schema.minimum}`
    case ValueErrorType.IntegerMultipleOf:
      return `${fieldName} must be a multiple of ${error.schema.multipleOf}`
    case ValueErrorType.Integer:
      return `${fieldName} must be an integer`
    case ValueErrorType.IntersectUnevaluatedProperties:
      return `${fieldName} property must exist`
    case ValueErrorType.Intersect:
      return `${fieldName} all operands must match`
    case ValueErrorType.Iterator:
      return `${fieldName} must be an Iterator`
    case ValueErrorType.Literal:
      return `${fieldName} must be ${typeof error.schema.const === 'string' ? `'${error.schema.const}'` : error.schema.const}`
    case ValueErrorType.Never:
      return `${fieldName} is never`
    case ValueErrorType.Not:
      return `${fieldName} must not be ${JSON.stringify(error.schema)}`
    case ValueErrorType.Null:
      return `${fieldName} must be null`    
    case ValueErrorType.NumberExclusiveMaximum:
      return `${fieldName} must be less than ${error.schema.exclusiveMaximum}`
    case ValueErrorType.NumberExclusiveMinimum:
      return `${fieldName} must be greater than ${error.schema.exclusiveMinimum}`
    case ValueErrorType.NumberMaximum:
      return `${fieldName} must be less or equal to ${error.schema.maximum}`
    case ValueErrorType.NumberMinimum:
      return `${fieldName} must be greater than or equal to ${error.schema.minimum}`
    case ValueErrorType.NumberMultipleOf:
      return `${fieldName} must be a multiple of ${error.schema.multipleOf}`
    case ValueErrorType.Number:
      return `${fieldName} must be a number`
    case ValueErrorType.Object:
      return `${fieldName} must be an object`
    case ValueErrorType.ObjectAdditionalProperties:
      return `${fieldName} has unexpected property`
    case ValueErrorType.ObjectMaxProperties:
      return `${fieldName} should have no more than ${error.schema.maxProperties} properties`
    case ValueErrorType.ObjectMinProperties:
      return `${fieldName} should have at least ${error.schema.minProperties} properties`
    case ValueErrorType.ObjectRequiredProperty:
      return `${fieldName} must have required property`
    case ValueErrorType.Promise:
      return `${fieldName} must be a Promise`
    case ValueErrorType.RegExp:
      return `${fieldName} must match regular expression`
    case ValueErrorType.StringFormatUnknown:
      return `${fieldName} uses unknown format '${error.schema.format}'`
    case ValueErrorType.StringFormat:
      return `${fieldName} must match match '${error.schema.format}' format`
    case ValueErrorType.StringMaxLength:
      return `${fieldName} length must be less or equal to ${error.schema.maxLength}`
    case ValueErrorType.StringMinLength:
      return `${fieldName} length must be greater or equal to ${error.schema.minLength}`
    case ValueErrorType.StringPattern:
      return `${fieldName} string must match '${error.schema.pattern}'`
    case ValueErrorType.String:
      return `${fieldName} must be a string`
    case ValueErrorType.Symbol:
      return `${fieldName} must be a symbol`
    case ValueErrorType.TupleLength:
      return `${fieldName} must have ${error.schema.maxItems || 0} elements`
    case ValueErrorType.Tuple:
      return `${fieldName} must be a tuple`
    case ValueErrorType.Uint8ArrayMaxByteLength:
      return `${fieldName} byte length less or equal to ${error.schema.maxByteLength}`
    case ValueErrorType.Uint8ArrayMinByteLength:
      return `${fieldName} byte length greater or equal to ${error.schema.minByteLength}`
    case ValueErrorType.Uint8Array:
      return `${fieldName} must be Uint8Array`
    case ValueErrorType.Undefined:
      return `${fieldName} must be undefined`
    case ValueErrorType.Union:
      return `${fieldName} must match one of the union variants`
    case ValueErrorType.Void:
      return `${fieldName} must be void`
    case ValueErrorType.Kind:
      return `Expected kind '${error.schema[Kind]}'`
    default:
      return 'Unknown error type'
  }
};

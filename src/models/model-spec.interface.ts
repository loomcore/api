import { TSchema } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';

/**
 * Interface representing a complete model specification with schema and validators
 */
export interface IModelSpec<T extends TSchema = TSchema> {
  /**
   * The primary TypeBox schema for validating all user-supplied properties
   */
  schema: T;
  
  /**
   * Partial version of the schema for validating update operations
   */
  partialSchema: TSchema;
  
  /**
   * Full version of the schema (user and system properties)for validating complete documents
   */
  fullSchema: T;

  /**
   * Compiled validator for the primary schema
   */
  validator: ReturnType<typeof TypeCompiler.Compile>;
  
  /**
   * Compiled validator for the partial schema
   */
  partialValidator: ReturnType<typeof TypeCompiler.Compile>;
  
  /**
   * Compiled validator for the full schema
   */
  fullValidator: ReturnType<typeof TypeCompiler.Compile>;

  /**
   * Indicates whether the model is auditable
   */
  isAuditable?: boolean;

  /**
   * Indicates whether the model is multi-tenant
   */
  isMultiTenant?: boolean;

  /**
   * Clean method that removes properties not defined in the schema
   * @param entity The entity to clean
   * @returns A cleaned entity with only schema-defined properties
   */
  // clean: <E>(entity: E) => E;

  /**
   * Encode method that converts values to the correct type
   * @param type The TypeBox type to encode
   * @param value The value to encode
   * @returns The encoded value
   */
  encode: <E>(entity: E, overrideSchema?: TSchema) => E;

  /**
   * Decode method that converts values to the correct type
   * @param type The TypeBox type to decode
   * @param value The value to decode
   * @returns The decoded value
   */
  decode: <E>(entity: E) => E;

  /**
   * Clean method that removes properties not defined in the schema
   * @param entity The entity to clean
   * @returns A cleaned entity with only schema-defined properties
   */
  clean: <E>(entity: E) => E;
} 
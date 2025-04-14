import { Type } from '@sinclair/typebox';
import { TypeboxIsoDate } from '../validation/index.js';

export interface IAuditable {
  _created: Date;
  _createdBy: string;
  _updated: Date;
  _updatedBy: string;
}

/**
 * Schema definition for the IAuditable interface to be used in validation and cleaning
 */
export const AuditableSchema = Type.Object({
  _created: TypeboxIsoDate(),
  _createdBy: Type.String(),
  _updated: TypeboxIsoDate(),
  _updatedBy: Type.String(),
});

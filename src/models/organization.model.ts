import {IAuditable} from './auditable.model.js';
import {ObjectId} from 'mongodb';
import { Type, Static } from '@sinclair/typebox';
import { entityUtils } from '../utils/index.js';

export interface IOrganization extends IAuditable {
  _id: ObjectId;
  name: string;
  code: string;
  description?: string;
  status: number;
  isMetaOrg: boolean;
  authToken?: string;
}

// Organization-specific properties schema
export const OrganizationSchema = Type.Object({
  name: Type.String({
    title: 'Name'
  }),
  code: Type.String({
    title: 'Code'
  }),
  description: Type.Optional(Type.String({
    title: 'Description'
  })),
  status: Type.Number({
    title: 'Status'
  }),
  isMetaOrg: Type.Boolean({
    title: 'Is Meta Organization',
    default: false
  }),
  authToken: Type.Optional(Type.String({
    title: 'Authentication Token'
  }))
});

// Create the model spec with auditable properties
export const OrganizationSpec = entityUtils.getModelSpec(OrganizationSchema, { isAuditable: true });




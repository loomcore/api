import { Type } from '@sinclair/typebox';
import {IEntity, IAuditable} from './index.js';
import { entityUtils } from '../utils/index.js';

export interface IPasswordResetToken extends IEntity, IAuditable {
	email: string;
	token: string;
	expiresOn: number;
}

// PasswordResetToken-specific properties schema
export const PasswordResetTokenSchema = Type.Object({
  email: Type.String({
    title: 'Email',
		format: 'email'
  }),
  token: Type.String({
    title: 'Token'
  }),
  expiresOn: Type.Number({
    title: 'Expires On'
  })
});

export const PasswordResetTokenSpec = entityUtils.getModelSpec(PasswordResetTokenSchema, { isAuditable: true });

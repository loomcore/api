import {IUser} from './user.model.js';
import {ITokenResponse, TokenResponseSchema} from './token-response.model.js';
import { Type } from '@sinclair/typebox';
import { IUserContext, UserContextSchema } from './user-context.model.js';
import { entityUtils } from '../utils/entity.utils.js';

export interface ILoginResponse {
  tokens: ITokenResponse;
  userContext: IUserContext;
}

/**
 * Schema for LoginResponse
 */
export const LoginResponseSchema = Type.Object({
  tokens: TokenResponseSchema,
  userContext: UserContextSchema
});

/**
 * Model spec for LoginResponse
 */
export const LoginResponseSpec = entityUtils.getModelSpec(LoginResponseSchema);

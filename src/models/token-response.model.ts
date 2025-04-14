import { Type } from '@sinclair/typebox';
import { entityUtils } from '../utils/entity.utils.js';

export interface ITokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresOn: number; // timestamp (in milliseconds since Jan 1, 1970 UTC)
}

/**
 * Schema for TokenResponse
 */
export const TokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresOn: Type.Number()
});

/**
 * Model spec for TokenResponse
 */
export const TokenResponseSpec = entityUtils.getModelSpec(TokenResponseSchema);

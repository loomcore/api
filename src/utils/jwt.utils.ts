import type { IUserContext } from '@loomcore/common/models';
import jwt from 'jsonwebtoken';
import { getAuthConfig } from './auth/get-auth-config.util.js';

export const IMPERSONATION_JWT_EXPIRATION_IN_SECONDS = 3600;

export function generateJwt(userContext: IUserContext, expiresInSeconds?: number) {
  const authConfig = getAuthConfig();
  const jwtExpiryConfig = expiresInSeconds ?? authConfig.jwtExpirationInSeconds;
  const jwtExpirationInSeconds =
    typeof jwtExpiryConfig === 'string'
      ? Number.parseInt(jwtExpiryConfig, 10)
      : jwtExpiryConfig;

  return jwt.sign(userContext, authConfig.clientSecret, {
    expiresIn: jwtExpirationInSeconds,
  });
}

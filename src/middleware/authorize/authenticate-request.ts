import type { IUserContext } from '@loomcore/common/models';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthenticatedError } from '../../errors/unauthenticated.error.js';
import { getAuthConfig } from '../../utils/auth/get-auth-config.util.js';
import { getAuthUserContextSpec } from '../../utils/index.js';

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return null;
  }
  const parts = authHeader.split('Bearer ');
  return parts.length > 1 ? parts[1] : null;
}

/**
 * Verifies a Bearer token when present. Returns null when missing or invalid —
 * never throws. Used to enrich `req.userContext` without deciding authentication.
 */
export function tryAuthenticateRequest(req: Request): IUserContext | null {
  const token = extractBearerToken(req);
  if (!token) {
    return null;
  }

  const authConfig = getAuthConfig();
  let rawPayload: string | jwt.JwtPayload;
  try {
    rawPayload = jwt.verify(token, authConfig.clientSecret);
  } catch {
    // jwt.verify throws TokenExpiredError ("jwt expired"), JsonWebTokenError, etc.
    return null;
  }
  return getAuthUserContextSpec().decode(rawPayload) as IUserContext;
}

export function authenticateRequest(req: Request): IUserContext {
  const userContext = tryAuthenticateRequest(req);
  if (!userContext) {
    throw new UnauthenticatedError();
  }
  return userContext;
}

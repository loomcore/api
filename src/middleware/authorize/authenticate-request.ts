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

export function authenticateRequest(req: Request): IUserContext {
  const token = extractBearerToken(req);
  if (!token) {
    throw new UnauthenticatedError();
  }

  const authConfig = getAuthConfig();
  let rawPayload: string | jwt.JwtPayload;
  try {
    rawPayload = jwt.verify(token, authConfig.clientSecret);
  } catch {
    // jwt.verify throws TokenExpiredError ("jwt expired"), JsonWebTokenError, etc.
    throw new UnauthenticatedError();
  }
  return getAuthUserContextSpec().decode(rawPayload) as IUserContext;
}

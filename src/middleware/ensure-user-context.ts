import { Request, Response, NextFunction } from 'express';
import { EmptyUserContext } from '@loomcore/common/models';
import { tryAuthenticateRequest } from './authorize/authenticate-request.js';

/**
 * Middleware that ensures every request has a userContext.
 * A valid Bearer token enriches the context with the authenticated user; otherwise EmptyUserContext.
 * This is not an authentication gate — secured routes still require authorize / @Authorize.
 */
export const ensureUserContext = (req: Request, res: Response, next: NextFunction) => {
  if (!req.userContext) {
    req.userContext = tryAuthenticateRequest(req) ?? EmptyUserContext;
  }
  next();
};

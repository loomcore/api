import { Request, Response, NextFunction } from 'express';
import { EmptyUserContext } from '@loomcore/common/models';

/**
 * Middleware that ensures every request has a userContext.
 * If no userContext exists, it sets an empty one.
 */
export const ensureUserContext = (req: Request, res: Response, next: NextFunction) => {
  if (!req.userContext) {
    req.userContext = EmptyUserContext;
  }
  next();
}; 
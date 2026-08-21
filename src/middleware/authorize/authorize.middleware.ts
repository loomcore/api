import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthRequirement } from '../../decorators/authorize.decorator.js';
import { UnauthorizedError } from '../../errors/index.js';
import { authenticateRequest } from './authenticate-request.js';

/**
 * Builds an Express middleware that enforces a resolved auth requirement.
 *
 * - `allowAnonymous: true` → no JWT required
 * - otherwise → JWT required; populates `req.userContext`
 * - if `features` is non-empty → also enforces feature access
 *
 * Attaching this middleware (via `authorizeMethod`) opts the route into
 * authentication unless marked `@AllowAnonymous()`. Routes that should be
 * fully public simply omit `authorize(...)`.
 */
export function buildAuthGuard(requirement: AuthRequirement | undefined): RequestHandler {
 return (req: Request, _res: Response, next: NextFunction) => {
  if (requirement?.allowAnonymous) {
   return next();
  }
  const userContext = authenticateRequest(req);
  req.userContext = userContext;

  if (!requirement || requirement.features.length === 0) {
   return next();
  }

  const userFeatures = new Set(userContext.features);
  const hasAccess =
   requirement.mode === 'all'
    ? requirement.features.every((f) => userFeatures.has(f))
    : requirement.features.some((f) => userFeatures.has(f));

  if (!hasAccess) {
   const missing = requirement.features.filter((f) => !userFeatures.has(f));
   throw new UnauthorizedError(missing);
  }

  next();
 };
}

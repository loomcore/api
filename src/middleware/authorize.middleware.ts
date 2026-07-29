import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthRequirement } from '../decorators/authorize.decorator.js';
import { UnauthenticatedError, UnauthorizedError } from '../errors/index.js';

/**
 * Builds an Express middleware that enforces a resolved feature requirement.
 * Assumes an upstream auth middleware has already populated req.user (401 if not).
 */
export function buildAuthGuard(requirement: AuthRequirement | undefined): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    // No @Authorize on this route at all -> open by default (mirrors .NET: no attribute = no restriction)
    if (!requirement || requirement.features.length === 0) {
      return next();
    }

    const userContext = req.userContext;
    if (!userContext) {
      throw new UnauthenticatedError();
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

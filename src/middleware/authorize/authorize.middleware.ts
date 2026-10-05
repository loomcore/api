import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { IAuthRequirement } from '../../decorators/auth-requirement.interface.js';
import { UnauthorizedError } from '../../errors/index.js';
import { authenticateRequest } from './authenticate-request.js';
import { getSystemUserContext } from '@loomcore/common/models';

/**
 * Builds an Express middleware that enforces a resolved auth requirement.
 *
 * - `allowAnonymous: true` → no JWT required
 * - otherwise → JWT required; populates `req.userContext`
 * - `denyOnImpersonation: true` → rejects impersonated sessions
 * - if `features` is non-empty → also enforces feature access
 *
 * Attaching this middleware (via `authorizeMethod`) opts the route into
 * authentication unless marked `@AllowAnonymous()`. Routes that should be
 * fully public simply omit `authorize(...)`.
 */
export function buildAuthGuard(requirement: IAuthRequirement | undefined): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (requirement?.allowAnonymous) {
      return next();
    }
    const userContext = authenticateRequest(req);
    req.userContext = userContext;

    if (requirement?.denyOnImpersonation && userContext.impersonatorId !== undefined) {
      throw new UnauthorizedError('Unauthorized: Endpoint requires non-impersonated user.');
    }

    const systemUserContext = getSystemUserContext();

    if (requirement?.requireMetaOrg && userContext.user._orgId !== systemUserContext.user._orgId) {
      throw new UnauthorizedError('Unauthorized: Endpoint requires meta organization user.');
    }

    if (!requirement || requirement.requiredFeatures?.length === 0) {
      return next();
    }

    const userFeatures = new Set(userContext.features);
    const hasFeatures =
      requirement.matchMode === 'all'
        ? requirement.requiredFeatures?.every((f) => userFeatures.has(f))
        : requirement.requiredFeatures?.some((f) => userFeatures.has(f));

    if (!hasFeatures) {
      const missing = requirement.requiredFeatures?.filter((f) => !userFeatures.has(f));
      throw new UnauthorizedError(`Unauthorized: Missing required feature(s): ${missing?.join(', ')}`);
    }

    next();
  };
};

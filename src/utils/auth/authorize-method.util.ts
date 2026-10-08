import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { resolveAuthRequirement } from '../../decorators/resolve-auth-requirement.util.js';
import { buildAuthGuard } from '../../middleware/authorize/authorize.middleware.js';
import { resolveAllowAnonymous } from '../../decorators/resolve-allow-anonymous.util.js';
import { BadRequestError } from '../../errors/bad-request.error.js';

/**
 * Resolves the effective @Authorize requirement for a single method (method-level,
 * falling back to class-level) and returns a ready-to-use Express middleware.
 *
 * Designed to drop directly into mapRoutes route registration, including in
 * derived controllers. Prefer `this.authorize(...)` on ApiController /
 * QueryApiController. Controllers that do not extend those bases can call this
 * helper directly:
 *
 *   app.get(`/api/${this.slug}`, this.authorize('get'), this.get.bind(this));
 *   app.post(`/api/${this.slug}`, this.authorize('create'), anotherMiddleware, this.create.bind(this));
 *
 * Note: pass the method NAME, not `this.create.bind(this)` — metadata is keyed on the
 * function object, and a bound function is a distinct object that doesn't carry it.
 */
export function authorizeMethod(
  instance: object,
  methodName: string
): RequestHandler {
  const constructor = instance.constructor;
  const prototype = Object.getPrototypeOf(instance);
  const allowAnonymous = resolveAllowAnonymous(constructor, prototype, methodName);
  const authRequirement = resolveAuthRequirement(constructor, prototype, methodName);
  if (allowAnonymous) {
    if (authRequirement) {
      throw new Error('Allow anonymous and authorize decorators cannot be used together.');
    }
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return buildAuthGuard(authRequirement);
}

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { hasAllowAnonymous } from '../../decorators/allow-anonymous.decorator.js';
import { hasAuthRequirement } from '../../decorators/authorize.decorator.js';
import { resolveAllowAnonymous } from '../../decorators/resolve-allow-anonymous.util.js';
import { resolveAuthRequirement } from '../../decorators/resolve-auth-requirement.util.js';
import { buildAuthGuard } from '../../middleware/authorize/authorize.middleware.js';

/**
 * Resolves auth for a single method and returns Express middleware.
 * A method `@Authorize` or `@AllowAnonymous` replaces the controller decorator.
 * The two decorators conflict only when both are on the same method or both are on the class.
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
  const method = prototype?.[methodName];
  const methodHasBoth = typeof method === 'function' && hasAllowAnonymous(method) && hasAuthRequirement(method);
  const classHasBoth = hasAllowAnonymous(constructor) && hasAuthRequirement(constructor);
  if (methodHasBoth || classHasBoth) {
    throw new Error('Allow anonymous and authorize decorators cannot be used together.');
  }
  if (resolveAllowAnonymous(constructor, prototype, methodName)) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return buildAuthGuard(resolveAuthRequirement(constructor, prototype, methodName));
}

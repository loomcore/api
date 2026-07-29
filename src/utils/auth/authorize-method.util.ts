import { RequestHandler } from 'express';
import { resolveAuthRequirement } from '../../decorators/authorize.decorator.js';
import { buildAuthGuard } from '../../middleware/authorize/authorize.middleware.js';

/**
 * Resolves the effective @Authorize requirement for a single method (method-level,
 * falling back to class-level) and returns a ready-to-use Express middleware.
 *
 * Designed to drop directly into your existing mapRoutes route registration,
 * alongside whatever other middleware a given route needs:
 *
 *   const authorize = (method: keyof this) => authorizeMethod(this, method);
 *
 *   app.get(`/api/${this.slug}`, authorize('get'), this.get.bind(this));
 *   app.post(`/api/${this.slug}`, authorize('create'), anotherMiddleware, this.create.bind(this));
 *
 * Note: pass the method NAME, not `this.create.bind(this)` — metadata is keyed on the
 * prototype + property key, and a bound function is a distinct object that doesn't carry it.
 */
export function authorizeMethod<T extends object>(
  instance: T,
  methodName: Extract<keyof T, string>
): RequestHandler {
  const constructor = instance.constructor;
  const prototype = Object.getPrototypeOf(instance);
  const requirement = resolveAuthRequirement(constructor, prototype, methodName);
  return buildAuthGuard(requirement);
}

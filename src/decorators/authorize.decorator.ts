import 'reflect-metadata';

export const AUTH_METADATA_KEY = Symbol('authorize:features');

export type MatchMode = 'all' | 'any';

export interface AuthRequirement {
  features: string[];
  mode: MatchMode;
  /** When true, skip JWT auth entirely (from `@AllowAnonymous`). */
  allowAnonymous?: boolean;
}

/**
 * Class decorator (controller-level) OR method decorator (action-level).
 *
 * Usage mirrors .NET's [Authorize] / [Authorize('featureName')] attribute design:
 *
 *   @Authorize()
 *   class ProductsController { ... }          // authenticated only
 *
 *   @Authorize('contentAdmin')
 *   class ProductsController { ... }          // authenticated + feature
 *
 *   class ProductsController {
 *     @Authorize('reportCreation')
 *     createReport(req, res) { ... }
 *   }
 *
 * By default listed features are treated with OR logic (if any are present, the user is authorized).
 *  Pass { all: true } for AND semantics (all features must be present).
 * A method-level @Authorize OVERRIDES a class-level one for that method.
 *
 * Routes that call `authorizeMethod` with no `@Authorize` metadata still require
 * a valid JWT (authenticated-only). Use `@AllowAnonymous()` to opt out.
 */
export function Authorize(
  features: string | string[] = [],
  options: { all?: boolean } = {}
) {
  const requirement: AuthRequirement = {
    features: Array.isArray(features) ? features : [features],
    mode: options.all ? 'all' : 'any',
  };

  return function (
    value: Function,
    _context: ClassDecoratorContext | ClassMethodDecoratorContext
  ) {
    // Stage 3: for methods `value` is the method; for classes it is the constructor.
    Reflect.defineMetadata(AUTH_METADATA_KEY, requirement, value);
  };
}

/** Explicit opt-out, e.g. a public health-check action on an otherwise-locked-down controller. */
export function AllowAnonymous() {
  return function (
    value: Function,
    _context: ClassDecoratorContext | ClassMethodDecoratorContext
  ) {
    const metadataValue: AuthRequirement = {
      features: [],
      mode: 'any',
      allowAnonymous: true,
    };
    Reflect.defineMetadata(AUTH_METADATA_KEY, metadataValue, value);
  };
}

/** Resolves the effective requirement for a given controller method: method-level wins, else class-level, else none. */
export function resolveAuthRequirement(
  controllerConstructor: Function,
  prototype: any,
  propertyKey: string
): AuthRequirement | undefined {
  const method = prototype[propertyKey];
  if (typeof method === 'function') {
    const methodLevel = Reflect.getMetadata(AUTH_METADATA_KEY, method);
    if (methodLevel) return methodLevel;
  }

  const classLevel = Reflect.getMetadata(AUTH_METADATA_KEY, controllerConstructor);
  if (classLevel) return classLevel;

  return undefined;
}

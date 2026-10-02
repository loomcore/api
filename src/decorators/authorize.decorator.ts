import 'reflect-metadata';

export const AUTH_METADATA_KEY = Symbol('authorize:features');
export const DENY_ON_IMPERSONATION_METADATA_KEY = Symbol('authorize:denyOnImpersonation');

export type MatchMode = 'all' | 'any';

export interface AuthRequirement {
  features: string[];
  mode: MatchMode;
  /** When true, skip JWT auth entirely (from `@AllowAnonymous`). */
  allowAnonymous?: boolean;
  /** When true, the user must not be impersonating to access the route. */
  denyOnImpersonation?: boolean;
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
   * Stack with `@DenyOnImpersonation()` to also reject impersonated sessions:
   *
   *   @DenyOnImpersonation()
   *   @Authorize()
   *   changePassword(req, res) { ... }
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

/** Blocks the route when the caller is impersonating. Stacks with `@Authorize` / class-level auth. */
export function DenyOnImpersonation() {
  return function (
    value: Function,
    _context: ClassDecoratorContext | ClassMethodDecoratorContext
  ) {
    Reflect.defineMetadata(DENY_ON_IMPERSONATION_METADATA_KEY, true, value);
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

function hasDenyOnImpersonation(target: Function | undefined): boolean {
  if (!target) return false;
  return Reflect.getMetadata(DENY_ON_IMPERSONATION_METADATA_KEY, target) === true;
}

/** Resolves the effective requirement for a given controller method: method-level wins, else class-level, else none. */
export function resolveAuthRequirement(
  controllerConstructor: Function,
  prototype: any,
  propertyKey: string
): AuthRequirement | undefined {
  const method = prototype[propertyKey];
  let requirement: AuthRequirement | undefined;

  if (typeof method === 'function') {
    const methodLevel = Reflect.getMetadata(AUTH_METADATA_KEY, method);
    if (methodLevel) requirement = { ...methodLevel };
  }

  if (!requirement) {
    const classLevel = Reflect.getMetadata(AUTH_METADATA_KEY, controllerConstructor);
    if (classLevel) requirement = { ...classLevel };
  }

  const denyOnImpersonation =
    (typeof method === 'function' && hasDenyOnImpersonation(method)) ||
    hasDenyOnImpersonation(controllerConstructor);

  if (denyOnImpersonation) {
    requirement = requirement ?? { features: [], mode: 'any' };
    requirement.denyOnImpersonation = true;
  }

  return requirement;
}

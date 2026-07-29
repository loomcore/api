import 'reflect-metadata';

export const AUTH_METADATA_KEY = Symbol('authorize:features');

export type MatchMode = 'all' | 'any';

export interface AuthRequirement {
  features: string[];
  mode: MatchMode;
}

/**
 * Class decorator (controller-level) OR method decorator (action-level).
 *
 * Usage mirrors .NET's [Authorize('featureName')] attribute design:
 *
 *   @Authorize('contentAdmin')
 *   class ProductsController { ... }
 *
 *   class ProductsController {
 *     @Authorize('reportCreation')
 *     createReport(req, res) { ... }
 *   }
 *
 * By default listed features are treated with OR logic (if any are present, the user is authorized).
 *  Pass { all: true } for AND semantics (all features must be present).
 * A method-level @Authorize OVERRIDES a class-level one for that method.
 */
export function Authorize(
  features: string | string[],
  options: { all?: boolean } = {}
) {
  const requirement: AuthRequirement = {
    features: Array.isArray(features) ? features : [features],
    mode: options.all ? 'all' : 'any',
  };

  return function (
    target: any,
    propertyKey?: string,
    _descriptor?: PropertyDescriptor
  ) {
    if (propertyKey) {
      // Method decorator: attach to the prototype method
      Reflect.defineMetadata(AUTH_METADATA_KEY, requirement, target, propertyKey);
    } else {
      // Class decorator: attach to the constructor itself
      Reflect.defineMetadata(AUTH_METADATA_KEY, requirement, target);
    }
  };
}

/** Explicit opt-out, e.g. a public health-check action on an otherwise-locked-down controller. */
export function AllowAnonymous() {
  return function (target: any, propertyKey?: string) {
    const metadataValue: AuthRequirement = { features: [], mode: 'any' };
    if (propertyKey) {
      Reflect.defineMetadata(AUTH_METADATA_KEY, metadataValue, target, propertyKey);
    } else {
      Reflect.defineMetadata(AUTH_METADATA_KEY, metadataValue, target);
    }
  };
}

/** Resolves the effective requirement for a given controller method: method-level wins, else class-level, else none. */
export function resolveAuthRequirement(
  controllerCtor: Function,
  prototype: any,
  propertyKey: string
): AuthRequirement | undefined {
  const methodLevel = Reflect.getMetadata(AUTH_METADATA_KEY, prototype, propertyKey);
  if (methodLevel) return methodLevel;

  const classLevel = Reflect.getMetadata(AUTH_METADATA_KEY, controllerCtor);
  if (classLevel) return classLevel;

  return undefined;
}

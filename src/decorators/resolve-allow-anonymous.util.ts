import { getValue } from './allow-anonymous.decorator.js';
import { resolveAuthDecoratorTarget } from './resolve-auth-decorator-target.util.js';

/**
 * Returns whether the winning target is `@AllowAnonymous`.
 * A method decorator replaces the controller decorator entirely.
 */
export function resolveAllowAnonymous(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string,
): boolean | undefined {
    const target = resolveAuthDecoratorTarget(controllerConstructor, prototype, propertyKey);
    return getValue(target);
}

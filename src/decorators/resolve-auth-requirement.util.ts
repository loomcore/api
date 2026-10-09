import { IAuthRequirement } from './auth-requirement.interface.js';
import { getAuthRequirement } from './authorize.decorator.js';
import { resolveAuthDecoratorTarget } from './resolve-auth-decorator-target.util.js';

/**
 * Returns the `@Authorize` metadata for the winning target.
 * A method decorator replaces the controller decorator entirely.
 */
export function resolveAuthRequirement(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string,
): IAuthRequirement | undefined {
    const target = resolveAuthDecoratorTarget(controllerConstructor, prototype, propertyKey);
    return getAuthRequirement(target);
}

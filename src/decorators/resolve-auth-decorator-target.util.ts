import { hasAllowAnonymous } from './allow-anonymous.decorator.js';
import { hasAuthRequirement } from './authorize.decorator.js';

/**
 * A method decorator replaces the controller decorator. If the method has
 * either `@Authorize` or `@AllowAnonymous`, that method is the only source.
 * Otherwise the controller decorators apply, including to inherited actions.
 */
export function resolveAuthDecoratorTarget(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string,
): Function {
    const method = prototype?.[propertyKey];
    if (typeof method === 'function' && (hasAuthRequirement(method) || hasAllowAnonymous(method))) {
        return method;
    }
    return controllerConstructor;
}

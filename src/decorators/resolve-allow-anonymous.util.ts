
import { getValue } from "./allow-anonymous.decorator.js";

/**
 * Class-level `@AllowAnonymous` applies to every action. A method-level
 * decorator overrides it. An action with no decorator keeps the class value.
 */
export function resolveAllowAnonymous(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string
): boolean | undefined {
    const method = prototype[propertyKey];
    if (typeof method === 'function') {
        return getValue(method);
    } else {
        return getValue(controllerConstructor);
    }
}

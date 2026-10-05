import { IAuthRequirement } from "./auth-requirement.interface.js";
import { getAuthRequirement } from "./authorize.decorator.js";

/**
 * Class-level decorators are the base. Method-level decorators override only the
 * fields they set, so an inherited action with no decorator keeps the class rule.
 * A method `@Authorize` replaces everything from the class-level decorator.
 */
export function resolveAuthRequirement(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string
): IAuthRequirement | undefined {
    const method = prototype[propertyKey];
    if (typeof method === 'function') {
        return getAuthRequirement(method);
    } else {
        return getAuthRequirement(controllerConstructor);
    }
}

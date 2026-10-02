
import { IAuthDecorator } from "./auth-decorator.interface.js";
import { IAuthRequirement } from "./auth-requirement.interface.js";
import { AllowAnonymousDecorator } from "./allow-anonymous.decorator.js";
import { AuthorizeDecorator } from "./authorize.decorator.js";
import { DenyOnImpersonationDecorator } from "./deny-on-impersonation.decorator.js";

function applyDecorator(
    decorator: IAuthDecorator,
    entity: any,
    requirement: IAuthRequirement | undefined,
): IAuthRequirement | undefined {
    return decorator.createOrUpdateAuthRequirement(requirement, entity);
}

function applyAuthRequirements(
    entity: any,
    requirement?: IAuthRequirement,
): IAuthRequirement | undefined {
    requirement = applyDecorator(new AllowAnonymousDecorator(), entity, requirement);
    requirement = applyDecorator(new AuthorizeDecorator(), entity, requirement);
    requirement = applyDecorator(new DenyOnImpersonationDecorator(), entity, requirement);

    return requirement;
}

/**
 * Class-level decorators are the base. Method-level decorators override only the
 * fields they set, so an inherited action with no decorator keeps the class rule.
 * A method `@Authorize` replaces features, match mode, and `requireMetaOrg`.
 */
export function resolveAuthRequirement(
    controllerConstructor: Function,
    prototype: any,
    propertyKey: string
): IAuthRequirement | undefined {
    let requirement = applyAuthRequirements(controllerConstructor);

    const method = prototype[propertyKey];
    if (typeof method === 'function') {
        requirement = applyAuthRequirements(method, requirement);
    }

    return requirement;
}

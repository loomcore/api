import { IAuthDecorator } from "./auth-decorator.interface.js";
import { IAuthRequirement } from "./auth-requirement.interface.js";

const DENY_ON_IMPERSONATION_METADATA_KEY = Symbol('auth-decorator:deny-on-impersonation');

/** Blocks the route when the caller is impersonating. Stacks with `@Authorize` or `@AllowAnonymous` */
export class DenyOnImpersonationDecorator implements IAuthDecorator {
    createOrUpdateAuthRequirement(requirement: IAuthRequirement | undefined, entity: any): IAuthRequirement | undefined {
        const value = Reflect.getMetadata(DENY_ON_IMPERSONATION_METADATA_KEY, entity);
        if (value === undefined) {
            return requirement;
        }

        if (!requirement) {
            return { denyOnImpersonation: value };
        }

        requirement.denyOnImpersonation = value;

        return requirement;
    }
}

export function DenyOnImpersonation() {
    return function (
        target: Function,
        _context: ClassDecoratorContext | ClassMethodDecoratorContext
    ) {
        Reflect.defineMetadata(DENY_ON_IMPERSONATION_METADATA_KEY, true, target);
    };
}
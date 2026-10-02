import { IAuthDecorator } from "./auth-decorator.interface.js";
import { IAuthRequirement } from "./auth-requirement.interface.js";

const ALLOW_ANONYMOUS_METADATA_KEY = Symbol('auth-decorator:allow-anonymous');

/** Explicit opt-out, e.g. a public health-check action on an otherwise-locked-down controller. */

export class AllowAnonymousDecorator implements IAuthDecorator {
    createOrUpdateAuthRequirement(requirement: IAuthRequirement | undefined, entity: any): IAuthRequirement | undefined {
        const value = Reflect.getMetadata(ALLOW_ANONYMOUS_METADATA_KEY, entity);
        if (value === undefined) {
            return requirement;
        }

        if (!requirement) {
            return { allowAnonymous: true };
        }

        requirement.allowAnonymous = value;
        return requirement;
    }
}

export function AllowAnonymous() {
    return function (
        target: Function,
        _context: ClassDecoratorContext | ClassMethodDecoratorContext
    ) {
        Reflect.defineMetadata(ALLOW_ANONYMOUS_METADATA_KEY, true, target);
    };
}
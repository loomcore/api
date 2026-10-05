/** Explicit opt-out, e.g. a public health-check action on an otherwise-locked-down controller. */

const ALLOW_ANONYMOUS_METADATA_KEY = Symbol('auth-decorator:allow-anonymous');

export function getValue(entity: any): boolean | undefined {
    const value = Reflect.getMetadata(ALLOW_ANONYMOUS_METADATA_KEY, entity);
    return value;
};

export function AllowAnonymous() {
    return function (
        target: Function,
        _context: ClassDecoratorContext | ClassMethodDecoratorContext
    ) {
        Reflect.defineMetadata(ALLOW_ANONYMOUS_METADATA_KEY, true, target);
    };
}
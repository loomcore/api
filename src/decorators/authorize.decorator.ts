import 'reflect-metadata';
import { IAuthRequirement, MatchMode } from './index.js';
import { IAuthDecorator } from './auth-decorator.interface.js';

const AUTHORIZE_METADATA_KEY = Symbol('auth-decorator:authorize');
export interface IAuthorizeOptions {
  features: string | string[];
  requireAll?: boolean;
  requireMetaOrg?: boolean;
}
export class AuthorizeDecorator implements IAuthDecorator {
  createOrUpdateAuthRequirement(requirement: IAuthRequirement | undefined, entity: any): IAuthRequirement | undefined {
    const value = Reflect.getMetadata(AUTHORIZE_METADATA_KEY, entity);
    if (value === undefined) {
      return requirement;
    }

    if (!requirement) {
      return {
        requiredFeatures: Array.isArray(value.features) ? value.features : [value.features],
        matchMode: value.requireAll ? 'all' : 'any',
        requireMetaOrg: value.requireMetaOrg === true,
      };
    }

    requirement.requiredFeatures = Array.isArray(value.features) ? value.features : [value.features];
    requirement.matchMode = value.requireAll ? 'all' : 'any';
    requirement.requireMetaOrg = value.requireMetaOrg === true;

    return requirement;
  }
};

export function Authorize(
  features: string | string[] = [],
  options: { all?: boolean, requireMetaOrg?: boolean } = {}
) {
  return function (
    target: Function,
    _context: ClassDecoratorContext | ClassMethodDecoratorContext
  ) {
    const value: IAuthorizeOptions = {
      features: Array.isArray(features) ? features : [features],
      requireAll: options.all === true,
      requireMetaOrg: options.requireMetaOrg === true,
    };
    // Stage 3: for methods `value` is the method; for classes it is the constructor.
    Reflect.defineMetadata(AUTHORIZE_METADATA_KEY, value, target);
  };
}
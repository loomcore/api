import 'reflect-metadata';
import { IAuthRequirement, MatchMode } from './index.js';

const AUTHORIZE_METADATA_KEY = Symbol('auth-decorator:authorize');

export function getAuthRequirement(entity: any): IAuthRequirement | undefined {
  const value = Reflect.getMetadata(AUTHORIZE_METADATA_KEY, entity);
  return value;
}

type AuthorizeDecorator = (
  target: Function,
  _context: ClassDecoratorContext | ClassMethodDecoratorContext
) => void;


export function Authorize(): AuthorizeDecorator;
export function Authorize(authRequirement: IAuthRequirement): AuthorizeDecorator;
export function Authorize(features: string | string[], matchMode?: MatchMode): AuthorizeDecorator;
export function Authorize(
  authRequirementOrFeatures?: IAuthRequirement | string[] | string,
  matchMode?: MatchMode
): AuthorizeDecorator {
  return function (
    target: Function,
    _context: ClassDecoratorContext | ClassMethodDecoratorContext
  ) {
    Reflect.defineMetadata(
      AUTHORIZE_METADATA_KEY,
      toAuthRequirement(authRequirementOrFeatures, matchMode),
      target
    );
  };
}

function toAuthRequirement(
  authRequirementOrFeatures?: IAuthRequirement | string[] | string,
  matchMode?: MatchMode
): IAuthRequirement | undefined {
  if (typeof authRequirementOrFeatures === 'string' || Array.isArray(authRequirementOrFeatures)) {
    const featureList = Array.isArray(authRequirementOrFeatures) ? authRequirementOrFeatures : [authRequirementOrFeatures];
    return { features: featureList, matchMode: matchMode ?? 'any' };
  }
  return authRequirementOrFeatures;
}
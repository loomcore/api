import type { IUserContext } from '@loomcore/common/models';
import { getSystemUserContext } from '@loomcore/common/models';

/**
 * Typed request context produced by ApiController.createContext.
 * Controllers may extend this with path-derived fields (e.g. contentType).
 */
export interface IRequestContext {
  userContext: IUserContext;
}

/** Builds an IRequestContext that acts as the system user. */
export function createSystemContext(): IRequestContext {
  return { userContext: getSystemUserContext() };
}

import type { IEntity } from '@loomcore/common/models';
import type { Filters } from './filters.type.js';
import type { IRequestContext } from './request-context.interface.js';

/**
 * Restricts which documents an operation can see and stamps the scoped field on every write.
 */
export interface IQueryScope<TContext extends IRequestContext = IRequestContext> {
  /** Merged into every get, getAll, find, findOne, count, getById, update, delete, and batch operation. */
  getFilters(context: TContext): Filters;
  /** Stamps the scoped field on every create and update so a document cannot be saved into the wrong scope. */
  applyToEntity(context: TContext, entity: Partial<IEntity>, isCreate: boolean): void;
}

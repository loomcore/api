import { AsyncLocalStorage } from 'async_hooks';
import type { AppIdType } from '@loomcore/common/types';

/**
 * Tenant context for request-scoped tenant isolation.
 *
 * When set, database operations will automatically filter by _orgId.
 * When not set (direct database calls, single-tenant mode, or system operations),
 * no tenant filtering is applied.
 */
export interface ITenantContext {
  /**
   * The organization ID to scope queries to.
   * When undefined, no tenant filtering is applied.
   */
  orgId?: AppIdType;
}

const tenantStorage = new AsyncLocalStorage<ITenantContext>();

/**
 * Execute a function with the given tenant context.
 * All async operations within the callback will have access to this context.
 *
 * @param context - The tenant context to set
 * @param fn - The function to execute within the context
 * @returns The result of the function
 */
export function runWithTenantContext<T>(context: ITenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

/**
 * Get the current tenant context.
 * Returns undefined if no context has been set (e.g., direct database calls).
 */
export function getTenantContext(): ITenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Get the current tenant org ID, if set.
 * Convenience function for database implementations.
 */
export function getTenantOrgId(): AppIdType | undefined {
  return tenantStorage.getStore()?.orgId;
}

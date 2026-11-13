import type { IEntity } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { BadRequestError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import type { Filters } from './filters.type.js';
import type { IQueryScope } from './query-scope.interface.js';
import type { IRequestContext } from './request-context.interface.js';

/**
 * Built-in tenant isolation scope. Applied automatically when config.app.isMultiTenant
 * and the service tenancy is 'isolated'. Preserves system-user and meta-org-admin behavior.
 */
export class TenantScope implements IQueryScope<IRequestContext> {
  getFilters(context: IRequestContext): Filters {
    if (this.isUnscoped(context)) {
      return {}; // system user and meta-org admins see every tenant
    }
    return { _orgId: { eq: this.requireOrgId(context) } };
  }

  applyToEntity(context: IRequestContext, entity: Partial<IEntity>, isCreate: boolean): void {
    if (isSystemUser(context.userContext)) {
      return; // system actions keep the supplied _orgId
    }
    if (isMetaOrgAdmin(context.userContext)) {
      if (isCreate) {
        entity._orgId = entity._orgId ?? context.userContext.user._orgId; // may create in any org, defaults to own
      }
      return;
    }
    // create AND update: a tenant user can never move a document
    entity._orgId = this.requireOrgId(context);
  }

  private isUnscoped(context: IRequestContext): boolean {
    return isSystemUser(context.userContext) || isMetaOrgAdmin(context.userContext);
  }

  private requireOrgId(context: IRequestContext): AppIdType {
    const orgId = context.userContext?.user?._orgId;
    if (!orgId) {
      throw new BadRequestError('A valid userContext with _orgId is required for multi-tenant operations');
    }
    return orgId;
  }
}

/** Shared singleton used by GenericQueryService.getEffectiveScopes. */
export const tenantScope = new TenantScope();

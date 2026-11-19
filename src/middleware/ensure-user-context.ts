import { EmptyUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import { NotFoundError } from '../errors/not-found.error.js';
import { OrganizationService } from '../services/organization.service.js';
import { emptyUserContextForOrg } from '../utils/auth/empty-user-context-for-org.util.js';
import { tryAuthenticateRequest } from './authorize/authenticate-request.js';
import { extractClientDomain } from './extract-client-domain.js';
import {
  DEFAULT_ORGANIZATION_DOMAIN_CACHE_MAX_SIZE,
  OrganizationDomainCache,
} from './organization-domain-cache.js';

let activeOrganizationDomainCache: OrganizationDomainCache | null = null;

/** Active LRU used by the registered userContext middleware (tests clear it after DB resets). */
export function getActiveOrganizationDomainCache(): OrganizationDomainCache | null {
  return activeOrganizationDomainCache;
}

export function clearActiveOrganizationDomainCache(): void {
  activeOrganizationDomainCache?.clear();
}

/**
 * Builds `req.userContext` for every request before route authorize.
 * A userContext always exists afterward; presence never means authenticated.
 * Authentication remains authorize / @Authorize / @AllowAnonymous only.
 *
 * Single-tenant: soft Bearer enrichment or EmptyUserContext (no org lookup).
 * Multi-tenant: Origin (else Referer) → organizationDomains; unknown/missing → 404;
 * matching-org token → authenticated context; otherwise EmptyUserContext with host `_orgId`.
 */
export function createUserContextMiddleware(
  database: IDatabase,
  options?: { cache?: OrganizationDomainCache; cacheMaxSize?: number },
): RequestHandler {
  const maxSize =
    options?.cacheMaxSize ??
    config.app.organizationDomainCacheMaxSize ??
    DEFAULT_ORGANIZATION_DOMAIN_CACHE_MAX_SIZE;
  const cache = options?.cache ?? new OrganizationDomainCache(maxSize);
  activeOrganizationDomainCache = cache;
  const organizationService = new OrganizationService(database);

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (req.userContext) {
        next();
        return;
      }

      if (!config.app.isMultiTenant) {
        req.userContext = tryAuthenticateRequest(req) ?? EmptyUserContext;
        next();
        return;
      }

      const domain = extractClientDomain(req);
      if (!domain) {
        // TODO: non-browser callers (server-to-server, curl) will later be supported via a specific custom header.
        throw new NotFoundError('No organization found for request origin');
      }

      const organizationId = await resolveOrganizationIdForDomain(organizationService, cache, domain);
      if (organizationId == null) {
        throw new NotFoundError(`No organization found for domain: ${domain}`);
      }

      const tokenContext = tryAuthenticateRequest(req);
      if (tokenContext && String(tokenContext.user?._orgId) === String(organizationId)) {
        req.userContext = tokenContext;
      } else {
        // Missing, invalid/expired, or mismatched-org token → anonymous host-org context.
        req.userContext = emptyUserContextForOrg(organizationId);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function resolveOrganizationIdForDomain(
  organizationService: OrganizationService,
  cache: OrganizationDomainCache,
  domain: string,
): Promise<AppIdType | null> {
  const cached = cache.get(domain);
  if (cached !== undefined) {
    return cached;
  }

  const organization = await organizationService.findByDomain(
    { userContext: EmptyUserContext },
    domain,
  );
  if (!organization?._id) {
    return null;
  }
  cache.set(domain, organization._id);
  return organization._id;
}

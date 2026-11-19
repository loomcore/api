import type { AppIdType } from '@loomcore/common/types';

/** Default bound for the in-process organizationDomains LRU cache. */
export const DEFAULT_ORGANIZATION_DOMAIN_CACHE_MAX_SIZE = 500;

/**
 * Lean LRU cache: domain (subdomain or full custom domain) → organization id.
 * Helper only — never the source of truth. Misses must query the DB; 404 only after the DB says absent.
 * No TTL (stale removed/reassigned domains stay until evicted; a short TTL can be added later if needed).
 */
export class OrganizationDomainCache {
  private readonly entries = new Map<string, AppIdType>();

  constructor(private readonly maxSize: number = DEFAULT_ORGANIZATION_DOMAIN_CACHE_MAX_SIZE) {
    if (maxSize < 1) {
      throw new Error('OrganizationDomainCache maxSize must be at least 1');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  has(domain: string): boolean {
    return this.entries.has(domain.trim().toLowerCase());
  }

  get(domain: string): AppIdType | undefined {
    const key = domain.trim().toLowerCase();
    if (!this.entries.has(key)) {
      return undefined;
    }
    const orgId = this.entries.get(key)!;
    // Refresh recency: delete + re-insert moves the key to the end (most recently used).
    this.entries.delete(key);
    this.entries.set(key, orgId);
    return orgId;
  }

  set(domain: string, organizationId: AppIdType): void {
    const key = domain.trim().toLowerCase();
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      const leastRecentlyUsed = this.entries.keys().next().value as string | undefined;
      if (leastRecentlyUsed !== undefined) {
        this.entries.delete(leastRecentlyUsed);
      }
    }
    this.entries.set(key, organizationId);
  }

  clear(): void {
    this.entries.clear();
  }
}

import type { Request } from 'express';

/**
 * Resolves the client app domain for multi-tenant org lookup.
 * Prefer Origin (browser CORS); fall back to Referer host.
 * Request Host is not used — on Cloud Run it is Google's domain and meaningless for tenancy.
 */
export function extractClientDomain(req: Request): string | null {
  const originHeader = req.get('origin') ?? (typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
  if (originHeader && originHeader !== 'null') {
    const fromOrigin = hostFromUrl(originHeader);
    if (fromOrigin) {
      return fromOrigin;
    }
  }

  const refererHeader = req.get('referer') ?? (typeof req.headers.referer === 'string' ? req.headers.referer : undefined);
  if (refererHeader) {
    const fromReferer = hostFromUrl(refererHeader);
    if (fromReferer) {
      return fromReferer;
    }
  }

  return null;
}

function hostFromUrl(value: string): string | null {
  try {
    // hostname omits port so it matches organizationDomains rows (domains stored without ports).
    const hostname = new URL(value).hostname;
    return hostname ? hostname.toLowerCase() : null;
  } catch {
    // Match AuthController's historical Referer parse when URL() rejects the value.
    const host = value.split('/')[2];
    if (!host) {
      return null;
    }
    return host.split(':')[0]?.toLowerCase() || null;
  }
}

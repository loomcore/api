/**
 * Builds the `cors` package `origin` option from config.network.corsAllowedOrigins.
 * Exact entries stay strings so they keep today's === matching.
 * Entries with a `*` (except a lone `*`) become a regex: `*` matches exactly one DNS label,
 * and other regex metacharacters (including `.`) are escaped.
 */
export function toCorsAllowedOrigins(allowedOrigins: string[]): Array<string | RegExp> {
  return allowedOrigins.map((allowed) => {
    if (!allowed.includes('*') || allowed === '*') {
      return allowed;
    }
    return allowedOriginToRegExp(allowed);
  });
}

export function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return toCorsAllowedOrigins(allowedOrigins).some((allowed) =>
    allowed instanceof RegExp ? allowed.test(origin) : origin === allowed,
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allowedOriginToRegExp(allowed: string): RegExp {
  return new RegExp(`^${escapeRegex(allowed).replace(/\\\*/g, '[^.]+')}$`);
}

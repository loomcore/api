/**
 * Builds the `cors` package `origin` option from config.network.corsAllowedOrigins.
 * A lone `*` entry returns `true`, which makes `cors` reflect the request origin
 * (a literal `*` header is rejected by browsers on credentialed requests).
 * Exact entries stay strings so they keep today's === matching.
 * Other entries with a `*` become a regex: `*` matches exactly one DNS label,
 * and other regex metacharacters (including `.`) are escaped.
 */
export function toCorsAllowedOrigins(allowedOrigins: string[]): true | Array<string | RegExp> {
  if (allowedOrigins.includes('*')) {
    return true;
  }
  return allowedOrigins.map((allowed) => {
    if (!allowed.includes('*')) {
      return allowed;
    }
    return allowedOriginToRegExp(allowed);
  });
}

export function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const allowedList = toCorsAllowedOrigins(allowedOrigins);
  if (allowedList === true) {
    return true;
  }
  return allowedList.some((allowed) =>
    allowed instanceof RegExp ? allowed.test(origin) : origin === allowed,
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allowedOriginToRegExp(allowed: string): RegExp {
  return new RegExp(`^${escapeRegex(allowed).replace(/\\\*/g, '[^.]+')}$`);
}

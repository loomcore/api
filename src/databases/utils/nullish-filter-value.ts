export type FilterComparison =
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'value'; value: unknown };

/**
 * Bare 'null' and 'undefined' tokens (and a real JavaScript null) are nullish filters.
 * A double-quoted token is the literal string, so '"undefined"' compares against the text undefined.
 * Quotes are recognized only around those two words.
 */
export function readFilterValue(raw: unknown): FilterComparison {
  if (typeof raw === 'string' && raw.startsWith('"') && raw.endsWith('"')) {
    const inner = raw.slice(1, -1);
    if (inner === 'null' || inner === 'undefined') {
      return { kind: 'value', value: inner };
    }
  }
  if (raw === null || raw === 'null') {
    return { kind: 'null' };
  }
  if (raw === 'undefined') {
    return { kind: 'undefined' };
  }
  return { kind: 'value', value: raw };
}

import { describe, expect, it } from 'vitest';
import { isCorsOriginAllowed, toCorsAllowedOrigins } from '../cors-origin.util.js';

describe('isCorsOriginAllowed', () => {
  const wildcardProd = ['https://*.example.com'];
  const wildcardDev = ['https://*.dev.example.com'];
  const exact = ['https://app.example.com', 'https://admin.example.com'];

  describe('wildcard: one DNS label', () => {
    it('matches a single tenant label on the client domain', () => {
      expect(isCorsOriginAllowed('https://acme.example.com', wildcardProd)).toBe(true);
    });

    it('matches a single tenant label on the dev client domain', () => {
      expect(isCorsOriginAllowed('https://acme.dev.example.com', wildcardDev)).toBe(true);
    });

    it('does not match two labels under the wildcard', () => {
      expect(isCorsOriginAllowed('https://a.b.example.com', wildcardProd)).toBe(false);
    });

    it('does not match the bare apex (zero labels under the wildcard)', () => {
      expect(isCorsOriginAllowed('https://example.com', wildcardProd)).toBe(false);
    });

    it('does not match a dev tenant against the prod wildcard', () => {
      expect(isCorsOriginAllowed('https://acme.dev.example.com', wildcardProd)).toBe(false);
    });

    it('does not match a prod tenant against the dev wildcard', () => {
      expect(isCorsOriginAllowed('https://acme.example.com', wildcardDev)).toBe(false);
    });
  });

  describe('scheme and port', () => {
    it('requires the scheme to match exactly', () => {
      expect(isCorsOriginAllowed('http://acme.example.com', wildcardProd)).toBe(false);
    });

    it('matches when the port is present on both sides', () => {
      expect(isCorsOriginAllowed('https://acme.example.com:8080', ['https://*.example.com:8080'])).toBe(true);
    });

    it('requires the port to match exactly', () => {
      expect(isCorsOriginAllowed('https://acme.example.com:8080', wildcardProd)).toBe(false);
      expect(isCorsOriginAllowed('https://acme.example.com', ['https://*.example.com:8080'])).toBe(false);
    });
  });

  describe('exact origins (today\'s behavior)', () => {
    it('allows an origin that is listed exactly', () => {
      expect(isCorsOriginAllowed('https://app.example.com', exact)).toBe(true);
      expect(isCorsOriginAllowed('https://admin.example.com', exact)).toBe(true);
    });

    it('rejects an origin that is not listed exactly', () => {
      expect(isCorsOriginAllowed('https://other.example.com', exact)).toBe(false);
      expect(isCorsOriginAllowed('https://app.example.com:443', exact)).toBe(false);
      expect(isCorsOriginAllowed('http://app.example.com', exact)).toBe(false);
    });

    it('treats a lone * as an exact origin, not allow-all', () => {
      expect(isCorsOriginAllowed('*', ['*'])).toBe(true);
      expect(isCorsOriginAllowed('https://acme.example.com', ['*'])).toBe(false);
    });
  });

  describe('regex escaping', () => {
    it('does not let `.` in the allowed origin match an arbitrary character', () => {
      expect(isCorsOriginAllowed('https://acme.exampleXcom', wildcardProd)).toBe(false);
    });

    it('does not let extra suffix labels sneak past the end of the pattern', () => {
      expect(isCorsOriginAllowed('https://acme.example.com.evil.com', wildcardProd)).toBe(false);
    });
  });

  describe('mixed allow-list', () => {
    const mixed = ['https://app.example.com', 'https://*.dev.example.com'];

    it('allows the exact origin and a matching wildcard origin', () => {
      expect(isCorsOriginAllowed('https://app.example.com', mixed)).toBe(true);
      expect(isCorsOriginAllowed('https://acme.dev.example.com', mixed)).toBe(true);
    });

    it('rejects origins that match neither entry', () => {
      expect(isCorsOriginAllowed('https://acme.example.com', mixed)).toBe(false);
    });
  });
});

describe('toCorsAllowedOrigins', () => {
  it('leaves exact origins as strings so cors keeps === matching', () => {
    const result = toCorsAllowedOrigins(['https://app.example.com', '*']);
    expect(result).toEqual(['https://app.example.com', '*']);
  });

  it('converts DNS-label wildcards to anchored regexes', () => {
    const result = toCorsAllowedOrigins(['https://*.example.com']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(RegExp);
    expect((result[0] as RegExp).test('https://acme.example.com')).toBe(true);
    expect((result[0] as RegExp).test('https://a.b.example.com')).toBe(false);
  });
});

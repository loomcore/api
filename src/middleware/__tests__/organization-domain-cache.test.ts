import { describe, expect, it } from 'vitest';
import { OrganizationDomainCache } from '../organization-domain-cache.js';

describe('OrganizationDomainCache', () => {
  it('should return undefined on a miss and store a value on set', () => {
    const cache = new OrganizationDomainCache(3);
    expect(cache.get('acme.example.com')).toBeUndefined();
    cache.set('acme.example.com', 'org-1');
    expect(cache.get('acme.example.com')).toBe('org-1');
    expect(cache.size).toBe(1);
  });

  it('should normalize domain keys case-insensitively', () => {
    const cache = new OrganizationDomainCache(3);
    cache.set('Acme.Example.COM', 'org-1');
    expect(cache.get('acme.example.com')).toBe('org-1');
    expect(cache.has('ACME.example.com')).toBe(true);
  });

  it('should refresh recency on get so a hit is not evicted before colder entries', () => {
    const cache = new OrganizationDomainCache(2);
    cache.set('a.example.com', 'org-a');
    cache.set('b.example.com', 'org-b');
    expect(cache.get('a.example.com')).toBe('org-a');
    cache.set('c.example.com', 'org-c');
    expect(cache.has('b.example.com')).toBe(false);
    expect(cache.get('a.example.com')).toBe('org-a');
    expect(cache.get('c.example.com')).toBe('org-c');
    expect(cache.size).toBe(2);
  });

  it('should evict the least recently used entry when a newly loaded org needs room', () => {
    const cache = new OrganizationDomainCache(2);
    cache.set('one.example.com', 'org-1');
    cache.set('two.example.com', 'org-2');
    cache.set('three.example.com', 'org-3');
    expect(cache.has('one.example.com')).toBe(false);
    expect(cache.get('two.example.com')).toBe('org-2');
    expect(cache.get('three.example.com')).toBe('org-3');
    expect(cache.size).toBe(2);
  });

  it('should clear all entries', () => {
    const cache = new OrganizationDomainCache(5);
    cache.set('a.example.com', 'org-a');
    cache.set('b.example.com', 'org-b');
    cache.clear();
    expect(cache.get('a.example.com')).toBeUndefined();
    expect(cache.get('b.example.com')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

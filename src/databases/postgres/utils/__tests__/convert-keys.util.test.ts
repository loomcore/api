import { describe, it, expect } from 'vitest';

import { toSnakeCase } from '../convert-keys.util.js';

describe('toSnakeCase', () => {
  it('inserts an underscore before a trailing number', () => {
    expect(toSnakeCase('addressLine1')).toBe('address_line_1');
  });

  it('keeps consecutive digits together', () => {
    expect(toSnakeCase('addressLine12')).toBe('address_line_12');
  });

  it('leaves an already snake_case name with a number unchanged', () => {
    expect(toSnakeCase('address_line_1')).toBe('address_line_1');
  });
});

import { describe, it, expect } from 'vitest';

import { toSnakeCase, toSqlColumnName, toSqlJoinLocalField } from '../convert-keys.util.js';

describe('toSnakeCase', () => {
  it('should insert an underscore before a trailing number', () => {
    expect(toSnakeCase('addressLine1')).toBe('address_line_1');
  });

  it('should keep consecutive digits together', () => {
    expect(toSnakeCase('addressLine12')).toBe('address_line_12');
  });

  it('should leave an already snake_case name with a number unchanged', () => {
    expect(toSnakeCase('address_line_1')).toBe('address_line_1');
  });
});

describe('toSqlColumnName', () => {
  it('should map camelCase model field names to snake_case columns', () => {
    expect(toSqlColumnName('categoryId')).toBe('category_id');
    expect(toSqlColumnName('personId')).toBe('person_id');
  });

  it('should leave already snake_case names unchanged', () => {
    expect(toSqlColumnName('category_id')).toBe('category_id');
    expect(toSqlColumnName('person_id')).toBe('person_id');
  });

  it('should leave underscore-prefixed names unchanged', () => {
    expect(toSqlColumnName('_id')).toBe('_id');
    expect(toSqlColumnName('_orgId')).toBe('_orgId');
  });

  it('should map bare id to _id', () => {
    expect(toSqlColumnName('id')).toBe('_id');
  });
});

describe('toSqlJoinLocalField', () => {
  it('should map a root camelCase localField to snake_case', () => {
    expect(toSqlJoinLocalField('categoryId')).toBe('category_id');
  });

  it('should leave a root snake_case localField unchanged', () => {
    expect(toSqlJoinLocalField('category_id')).toBe('category_id');
  });

  it('should map only the column segment of a dotted localField', () => {
    expect(toSqlJoinLocalField('agent.personId')).toBe('agent.person_id');
    expect(toSqlJoinLocalField('clientPerson._id')).toBe('clientPerson._id');
  });

  it('should leave a dotted snake_case localField unchanged', () => {
    expect(toSqlJoinLocalField('agent.person_id')).toBe('agent.person_id');
  });
});

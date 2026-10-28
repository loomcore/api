import { describe, it, expect } from 'vitest';
import { IQueryOptions } from '@loomcore/common/models';

import { buildWhereClause } from '../build-where-clause.js';

function whereFor(filters: IQueryOptions['filters'], tablePrefix?: string) {
  return buildWhereClause({ filters }, [], tablePrefix);
}

const equality = (column: string, index: number) =>
  `(${column} = $${index} OR (${column} IS NULL AND $${index} IS NULL))`;

const inequality = (column: string, index: number) =>
  `(${column} != $${index} OR (${column} IS NOT NULL AND $${index} IS NULL) OR (${column} IS NULL AND $${index} IS NOT NULL))`;

describe('buildWhereClause', () => {
  it('matches a null parentId with IS NULL and no bound value', () => {
    expect(whereFor({ parentId: { eq: 'null' } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NULL',
      values: []
    });
    expect(whereFor({ parentId: { eq: null } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NULL',
      values: []
    });
  });

  it('treats a bare undefined token the same as null', () => {
    expect(whereFor({ parentId: { eq: 'undefined' } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NULL',
      values: []
    });
  });

  it('matches ne null and ne undefined with IS NOT NULL', () => {
    expect(whereFor({ parentId: { ne: 'null' } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NOT NULL',
      values: []
    });
    expect(whereFor({ parentId: { ne: 'undefined' } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NOT NULL',
      values: []
    });
    expect(whereFor({ parentId: { ne: null } })).toEqual({
      whereClause: 'WHERE "parent_id" IS NOT NULL',
      values: []
    });
  });

  it('binds a double-quoted null or undefined as a literal string', () => {
    expect(whereFor({ parentId: { eq: '"null"' } })).toEqual({
      whereClause: `WHERE ${equality('"parent_id"', 1)}`,
      values: ['null']
    });
    expect(whereFor({ parentId: { eq: '"undefined"' } })).toEqual({
      whereClause: `WHERE ${equality('"parent_id"', 1)}`,
      values: ['undefined']
    });
    expect(whereFor({ name: { ne: '"null"' } })).toEqual({
      whereClause: `WHERE ${inequality('"name"', 1)}`,
      values: ['null']
    });
    expect(whereFor({ name: { ne: '"undefined"' } })).toEqual({
      whereClause: `WHERE ${inequality('"name"', 1)}`,
      values: ['undefined']
    });
  });

  it('leaves other quoted strings unchanged', () => {
    expect(whereFor({ name: { eq: '"hello"' } })).toEqual({
      whereClause: `WHERE ${equality('"name"', 1)}`,
      values: ['"hello"']
    });
  });

  it('still binds an ordinary eq value', () => {
    expect(whereFor({ parentId: { eq: 5 } })).toEqual({
      whereClause: `WHERE ${equality('"parent_id"', 1)}`,
      values: [5]
    });
  });

  it('does not consume a parameter for a nullish filter combined with another eq', () => {
    expect(whereFor({ parentId: { eq: 'null' }, name: { eq: 'Warehouse' } })).toEqual({
      whereClause: `WHERE "parent_id" IS NULL AND ${equality('"name"', 1)}`,
      values: ['Warehouse']
    });
  });

  it('qualifies the column when a table prefix is provided', () => {
    expect(whereFor({ parentId: { eq: 'undefined' } }, 'locations')).toEqual({
      whereClause: 'WHERE "locations"."parent_id" IS NULL',
      values: []
    });
  });
});

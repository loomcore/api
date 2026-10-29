import { describe, expect, it } from 'vitest';
import { IQueryOptions } from '@loomcore/common/models';
import { BadRequestError } from '../../../../errors/index.js';
import { InnerJoin } from '../../../operations/inner-join.operation.js';
import { LeftJoin } from '../../../operations/left-join.operation.js';
import { LeftJoinMany } from '../../../operations/left-join-many.operation.js';
import { buildCountQuerySql } from '../build-count-query.js';
import { buildWhereClause } from '../build-where-clause.js';

function whereFor(filters: IQueryOptions['filters'], tablePrefix = 'items') {
  return buildWhereClause({ filters }, tablePrefix);
}

const equality = (column: string, index: number) =>
  `(${column} = $${index} OR (${column} IS NULL AND $${index} IS NULL))`;

const inequality = (column: string, index: number) =>
  `(${column} != $${index} OR (${column} IS NOT NULL AND $${index} IS NULL) OR (${column} IS NULL AND $${index} IS NOT NULL))`;

describe('buildWhereClause', () => {
  it('matches a null parentId with IS NULL and no bound value', () => {
    expect(whereFor({ parentId: { eq: 'null' } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NULL',
      values: []
    });
    expect(whereFor({ parentId: { eq: null } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NULL',
      values: []
    });
  });

  it('treats a bare undefined token the same as null', () => {
    expect(whereFor({ parentId: { eq: 'undefined' } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NULL',
      values: []
    });
  });

  it('matches ne null and ne undefined with IS NOT NULL', () => {
    expect(whereFor({ parentId: { ne: 'null' } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NOT NULL',
      values: []
    });
    expect(whereFor({ parentId: { ne: 'undefined' } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NOT NULL',
      values: []
    });
    expect(whereFor({ parentId: { ne: null } })).toEqual({
      whereClause: 'WHERE "items"."parent_id" IS NOT NULL',
      values: []
    });
  });

  it('binds a double-quoted null or undefined as a literal string', () => {
    expect(whereFor({ parentId: { eq: '"null"' } })).toEqual({
      whereClause: `WHERE ${equality('"items"."parent_id"', 1)}`,
      values: ['null']
    });
    expect(whereFor({ parentId: { eq: '"undefined"' } })).toEqual({
      whereClause: `WHERE ${equality('"items"."parent_id"', 1)}`,
      values: ['undefined']
    });
    expect(whereFor({ name: { ne: '"null"' } })).toEqual({
      whereClause: `WHERE ${inequality('"items"."name"', 1)}`,
      values: ['null']
    });
    expect(whereFor({ name: { ne: '"undefined"' } })).toEqual({
      whereClause: `WHERE ${inequality('"items"."name"', 1)}`,
      values: ['undefined']
    });
  });

  it('leaves other quoted strings unchanged', () => {
    expect(whereFor({ name: { eq: '"hello"' } })).toEqual({
      whereClause: `WHERE ${equality('"items"."name"', 1)}`,
      values: ['"hello"']
    });
  });

  it('still binds an ordinary eq value', () => {
    expect(whereFor({ parentId: { eq: 5 } })).toEqual({
      whereClause: `WHERE ${equality('"items"."parent_id"', 1)}`,
      values: [5]
    });
  });

  it('does not consume a parameter for a nullish filter combined with another eq', () => {
    expect(whereFor({ parentId: { eq: 'null' }, name: { eq: 'Warehouse' } })).toEqual({
      whereClause: `WHERE "items"."parent_id" IS NULL AND ${equality('"items"."name"', 1)}`,
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

const customerJoin = new LeftJoin('customers', 'customer_id', '_id', 'customer');

describe('buildWhereClause join filters', () => {
  it('qualifies a root filter with the main table when joins are present', () => {
    const { whereClause, values } = buildWhereClause(
      { filters: { status: { eq: 'pending' } } },
      'orders',
      [],
      [customerJoin],
    );

    expect(whereClause).toBe('WHERE ("orders"."status" = $1 OR ("orders"."status" IS NULL AND $1 IS NULL))');
    expect(values).toEqual(['pending']);
  });

  it('qualifies a one-to-one join column and snake-cases it', () => {
    const { whereClause, values } = buildWhereClause(
      { filters: { 'customer.firstName': { eq: 'Jane' } } },
      'orders',
      [],
      [customerJoin],
    );

    expect(whereClause).toBe('WHERE ("customer"."first_name" = $1 OR ("customer"."first_name" IS NULL AND $1 IS NULL))');
    expect(values).toEqual(['Jane']);
  });

  it('does not treat a missing left join as a match for ne', () => {
    const { whereClause } = buildWhereClause(
      { filters: { 'customer.name': { ne: 'Jane' } } },
      'orders',
      [],
      [customerJoin],
    );

    expect(whereClause).toContain('"customer"."name" != $1');
    expect(whereClause).toContain('"customer"."_id" IS NOT NULL');
  });

  it('filters a nested one-to-one column on the joined alias', () => {
    const person = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
    const school = new LeftJoin('schools', 'clientPerson.school_id', '_id', 'school');
    const { whereClause } = buildWhereClause(
      { filters: { 'clientPerson.school.name': { eq: 'Lincoln' } } },
      'clients',
      [],
      [person, school],
    );

    expect(whereClause).toContain('"school"."name"');
    expect(whereClause).not.toContain('EXISTS');
  });

  it('keeps a dotted key on the root table when it is not a join alias', () => {
    const { whereClause } = buildWhereClause(
      { filters: { 'address.city': { eq: 'Austin' } } },
      'orders',
      [],
      [customerJoin],
    );

    expect(whereClause).toContain('"orders"."address.city"');
  });

  it('keeps dotted keys as a single column when no joins are supplied', () => {
    const { whereClause } = buildWhereClause({ filters: { 'customer.name': { eq: 'Jane' } } }, 'orders');

    expect(whereClause).toContain('"orders"."customer.name"');
    expect(whereClause).not.toContain('EXISTS');
  });

  it('matches a one-to-many join when any related row matches', () => {
    const lineItems = new LeftJoinMany('line_items', '_id', 'order_id', 'lineItems');
    const { whereClause, values } = buildWhereClause(
      { filters: { 'lineItems.sku': { eq: 'ABC' } } },
      'orders',
      [],
      [lineItems],
    );

    expect(whereClause).toBe(
      'WHERE EXISTS (SELECT 1 FROM "line_items" AS "lineItems" WHERE "orders"."_id" = "lineItems"."order_id" AND ("lineItems"."sku" = $1 OR ("lineItems"."sku" IS NULL AND $1 IS NULL)))',
    );
    expect(values).toEqual(['ABC']);
  });

  it('correlates a many-to-many filter to the through table already in the outer query', () => {
    const person = new LeftJoin('persons', 'person_id', '_id', 'clientPerson');
    const through = new InnerJoin('persons_phone_numbers', 'clientPerson._id', 'person_id', 'phoneThrough');
    const phones = new LeftJoinMany('phone_numbers', 'phoneThrough.phone_number_id', '_id', 'phones');
    const { whereClause, values } = buildWhereClause(
      { filters: { 'clientPerson.phoneThrough.phones.phoneNumber': { contains: '555' } } },
      'clients',
      [],
      [person, through, phones],
    );

    expect(whereClause).toBe(
      'WHERE EXISTS (SELECT 1 FROM "phone_numbers" AS "phones" WHERE "phoneThrough"."phone_number_id" = "phones"."_id" AND LOWER("phones"."phone_number") LIKE LOWER($1))',
    );
    expect(values).toEqual(['%555%']);
  });

  it('includes a through table inside EXISTS when that table is not in the outer query', () => {
    const policies = new LeftJoinMany('policies', '_id', 'client_id', 'clientPolicies');
    const through = new InnerJoin('agents_policies', 'clientPolicies._id', 'policy_id', 'policyAgentsThrough');
    const agents = new LeftJoinMany('agents', 'policyAgentsThrough.agent_id', '_id', 'policyAgents');
    const { whereClause, values } = buildWhereClause(
      { filters: { 'clientPolicies.policyAgentsThrough.policyAgents.name': { eq: 'Ada' } } },
      'clients',
      [],
      [policies, through, agents],
    );

    expect(whereClause).toBe(
      'WHERE EXISTS (SELECT 1 FROM "policies" AS "clientPolicies" INNER JOIN "agents_policies" AS "policyAgentsThrough" ON "clientPolicies"."_id" = "policyAgentsThrough"."policy_id" INNER JOIN "agents" AS "policyAgents" ON "policyAgentsThrough"."agent_id" = "policyAgents"."_id" WHERE "clients"."_id" = "clientPolicies"."client_id" AND ("policyAgents"."name" = $1 OR ("policyAgents"."name" IS NULL AND $1 IS NULL)))',
    );
    expect(values).toEqual(['Ada']);
  });

  it('rejects a dotted key that starts with a join alias but is not a real path', () => {
    expect(() => buildWhereClause(
      { filters: { 'customer.nope.name': { eq: 'x' } } },
      'orders',
      [],
      [customerJoin],
    )).toThrow(BadRequestError);
  });

  it('builds a count query with the same joins and where clause', () => {
    const { countQuery, values } = buildCountQuerySql('orders', {
      filters: {
        status: { eq: 'pending' },
        'customer.name': { eq: 'Jane' },
      },
    }, [customerJoin]);

    expect(countQuery.startsWith('SELECT COUNT(*) as total FROM "orders"')).toBe(true);
    expect(countQuery).toContain('LEFT JOIN "customers" AS "customer" ON "orders"."customer_id" = "customer"."_id"');
    expect(countQuery).toContain('"orders"."status"');
    expect(countQuery).toContain('"customer"."name"');
    expect(values).toEqual(['pending', 'Jane']);
  });

  it('counts a one-to-many filter with EXISTS and no outer join', () => {
    const lineItems = new LeftJoinMany('line_items', '_id', 'order_id', 'lineItems');
    const { countQuery, values } = buildCountQuerySql(
      'orders',
      { filters: { 'lineItems.sku': { eq: 'ABC' } } },
      [lineItems],
    );

    expect(countQuery).toContain('EXISTS (SELECT 1 FROM "line_items" AS "lineItems"');
    expect(countQuery).not.toContain('JOIN');
    expect(values).toEqual(['ABC']);
  });
});

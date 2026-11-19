import { describe, it, expect } from 'vitest';

import { LeftJoin } from '../../../operations/left-join.operation.js';
import { InnerJoin } from '../../../operations/inner-join.operation.js';
import { LeftJoinMany } from '../../../operations/left-join-many.operation.js';
import { buildJoinClauses } from '../build-join-clauses.js';

describe('buildJoinClauses field name mapping', () => {
  it('should map camelCase localField and foreignField to snake_case columns', () => {
    const join = new LeftJoin('categories', 'categoryId', '_id', 'category');
    const sql = buildJoinClauses([join], 'products');
    expect(sql).toBe(
      'LEFT JOIN "categories" AS "category" ON "products"."category_id" = "category"."_id"',
    );
  });

  it('should leave already snake_case localField and foreignField unchanged', () => {
    const join = new LeftJoin('categories', 'category_id', '_id', 'category');
    const sql = buildJoinClauses([join], 'products');
    expect(sql).toBe(
      'LEFT JOIN "categories" AS "category" ON "products"."category_id" = "category"."_id"',
    );
  });

  it('should map only the column segment of a dotted camelCase localField', () => {
    const agent = new LeftJoin('agents', 'agentId', '_id', 'agent');
    const agentPerson = new LeftJoin('persons', 'agent.personId', '_id', 'agentPerson');
    const sql = buildJoinClauses([agent, agentPerson], 'clients');
    expect(sql).toContain('LEFT JOIN "agents" AS "agent" ON "clients"."agent_id" = "agent"."_id"');
    expect(sql).toContain('LEFT JOIN "persons" AS "agentPerson" ON "agent"."person_id" = "agentPerson"."_id"');
  });

  it('should map InnerJoin camelCase fields the same way as LeftJoin', () => {
    const join = new InnerJoin('customers', 'customerId', '_id', 'customer');
    const sql = buildJoinClauses([join], 'orders');
    expect(sql).toBe(
      'INNER JOIN "customers" AS "customer" ON "orders"."customer_id" = "customer"."_id"',
    );
  });

  it('should omit LeftJoinMany from outer join clauses', () => {
    const many = new LeftJoinMany('lineItems', '_id', 'orderId', 'items');
    expect(buildJoinClauses([many], 'orders')).toBe('');
  });
});

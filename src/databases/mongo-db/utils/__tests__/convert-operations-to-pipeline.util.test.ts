import { describe, expect, it } from 'vitest';
import type { Operation } from '../../../operations/operation.js';
import { InnerJoin } from '../../../operations/inner-join.operation.js';
import { LeftJoin } from '../../../operations/left-join.operation.js';
import { LeftJoinMany } from '../../../operations/left-join-many.operation.js';
import { convertOperationsToPipeline } from '../convert-operations-to-pipeline.util.js';

function unwindPreservesMissing(alias: string, operations: Operation[]): boolean {
  const pipeline = convertOperationsToPipeline(operations);
  const unwind = pipeline.find(stage => stage.$unwind?.path === `$${alias}Arr`);
  return unwind?.$unwind.preserveNullAndEmptyArrays === true;
}

describe('convertOperationsToPipeline inner join', () => {
  it('should drop the root document when a root inner join matches nothing', () => {
    const customer = new InnerJoin('customers', 'customerId', '_id', 'customer');
    expect(unwindPreservesMissing('customer', [customer])).toBe(false);
  });

  it('should drop the root document when an inner join under a one-to-one matches nothing', () => {
    const person = new LeftJoin('persons', 'personId', '_id', 'clientPerson');
    const through = new InnerJoin('persons_phone_numbers', 'clientPerson._id', 'personId', 'phoneThrough');
    expect(unwindPreservesMissing('phoneThrough', [person, through])).toBe(false);
  });

  it('should keep the root document when a left join matches nothing', () => {
    const customer = new LeftJoin('customers', 'customerId', '_id', 'customer');
    expect(unwindPreservesMissing('customer', [customer])).toBe(true);
  });

  it('should keep the root document when an inner join hangs off a many', () => {
    const policies = new LeftJoinMany('policies', '_id', 'clientId', 'clientPolicies');
    const through = new InnerJoin('agents_policies', 'clientPolicies._id', 'policyId', 'policyAgentsThrough');
    expect(unwindPreservesMissing('policyAgentsThrough', [policies, through])).toBe(true);
  });
});

describe('convertOperationsToPipeline field names', () => {
  it('should pass camelCase localField and foreignField through unchanged for Mongo', () => {
    const customer = new LeftJoin('customers', 'customerId', '_id', 'customer');
    const pipeline = convertOperationsToPipeline([customer]);
    const lookup = pipeline.find(stage => stage.$lookup?.as === 'customerArr');
    // ObjectId foreignField uses let/pipeline; names must stay camelCase (no Postgres snake_case mapping).
    expect(lookup?.$lookup.let.localId.$cond[0].$eq[0].$type).toBe('$customerId');
    expect(lookup?.$lookup.pipeline[0].$match.$expr.$eq[0]).toBe('$_id');
  });
});

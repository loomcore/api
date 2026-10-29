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
  it('drops the root document when a root inner join matches nothing', () => {
    const customer = new InnerJoin('customers', 'customerId', '_id', 'customer');
    expect(unwindPreservesMissing('customer', [customer])).toBe(false);
  });

  it('drops the root document when an inner join under a one-to-one matches nothing', () => {
    const person = new LeftJoin('persons', 'personId', '_id', 'clientPerson');
    const through = new InnerJoin('persons_phone_numbers', 'clientPerson._id', 'personId', 'phoneThrough');
    expect(unwindPreservesMissing('phoneThrough', [person, through])).toBe(false);
  });

  it('keeps the root document when a left join matches nothing', () => {
    const customer = new LeftJoin('customers', 'customerId', '_id', 'customer');
    expect(unwindPreservesMissing('customer', [customer])).toBe(true);
  });

  it('keeps the root document when an inner join hangs off a many', () => {
    const policies = new LeftJoinMany('policies', '_id', 'clientId', 'clientPolicies');
    const through = new InnerJoin('agents_policies', 'clientPolicies._id', 'policyId', 'policyAgentsThrough');
    expect(unwindPreservesMissing('policyAgentsThrough', [policies, through])).toBe(true);
  });
});

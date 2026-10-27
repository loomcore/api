import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../../../errors/index.js';
import { LeftJoin } from '../../../operations/left-join.operation.js';
import { LeftJoinMany } from '../../../operations/left-join-many.operation.js';
import { partitionFilters } from '../../../utils/resolve-join-filter.js';
import { buildJoinMatchStage } from '../build-join-match.util.js';

describe('buildJoinMatchStage', () => {
  const customer = new LeftJoin('customers', 'customerId', '_id', 'customer');

  it('matches a one-to-one join on its _joinData path', () => {
    const { joinFilters } = partitionFilters(
      { filters: { 'customer.name': { eq: 'Jane' } } },
      [customer],
      'orders',
    );

    expect(buildJoinMatchStage(joinFilters, [customer])).toEqual({
      $match: {
        '_joinData.customer.name': 'Jane',
      },
    });
  });

  it('requires the joined object to exist when using ne', () => {
    const { joinFilters } = partitionFilters(
      { filters: { 'customer.name': { ne: 'Jane' } } },
      [customer],
      'orders',
    );

    expect(buildJoinMatchStage(joinFilters, [customer])).toEqual({
      $match: {
        '_joinData.customer.name': { $ne: 'Jane' },
        '_joinData.customer': { $ne: null },
      },
    });
  });

  it('matches a one-to-many join when any array element matches', () => {
    const lineItems = new LeftJoinMany('lineItems', '_id', 'orderId', 'items');
    const operations = [lineItems];
    const { joinFilters } = partitionFilters(
      { filters: { 'items.sku': { eq: 'ABC' } } },
      operations,
      'orders',
    );

    expect(buildJoinMatchStage(joinFilters, operations)).toEqual({
      $match: {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ['$_joinData.items', []] },
                  as: 'j0',
                  cond: { $eq: ['$$j0.sku', 'ABC'] },
                },
              },
            },
            0,
          ],
        },
      },
    });
  });

  it('filters a many nested under a one-to-one join', () => {
    const person = new LeftJoin('persons', 'personId', '_id', 'clientPerson');
    const emails = new LeftJoinMany('emailAddresses', 'clientPerson._id', 'personId', 'clientEmailAddresses');
    const operations = [person, emails];
    const { joinFilters } = partitionFilters(
      { filters: { 'clientPerson.clientEmailAddresses.email': { contains: 'gmail' } } },
      operations,
      'clients',
    );

    expect(buildJoinMatchStage(joinFilters, operations)).toEqual({
      $match: {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ['$_joinData.clientPerson.clientEmailAddresses', []] },
                  as: 'j1',
                  cond: {
                    $cond: [
                      { $eq: [{ $type: '$$j1.email' }, 'string'] },
                      { $regexMatch: { input: '$$j1.email', regex: 'gmail', options: 'i' } },
                      false,
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
    });
  });

  it('rejects a join path that does not match the operations', () => {
    expect(() => partitionFilters(
      { filters: { 'customer.nope.name': { eq: 'x' } } },
      [customer],
      'orders',
    )).toThrow(BadRequestError);
  });
});

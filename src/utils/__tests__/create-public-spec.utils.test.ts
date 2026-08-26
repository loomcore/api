import { describe, it, expect, beforeAll } from 'vitest';
import { Type } from '@sinclair/typebox';
import { entityUtils } from '@loomcore/common/utils';
import { TestItemSpec } from '../../__tests__/models/test-item.model.js';
import { setupTestConfig } from '../../__tests__/common-test.utils.js';
import { createPublicSpec } from '../create-public-spec.utils.js';

describe('createPublicSpec', () => {
  beforeAll(() => {
    setupTestConfig(true, process.env.TEST_DATABASE === 'postgres' ? 'postgres' : 'mongodb');
  });

  it('keeps _id and _orgId and omits audit fields', () => {
    const isPostgres = process.env.TEST_DATABASE === 'postgres';
    const id = isPostgres ? 1 : '507f1f77bcf86cd799439011';
    const orgId = isPostgres ? 2 : '507f1f77bcf86cd799439012';
    const publicSpec = createPublicSpec(TestItemSpec);
    expect(publicSpec.isEntity).toBe(true);
    expect(publicSpec.isAuditable).toBe(false);
    const encoded = publicSpec.encode({
      _id: id,
      name: 'Item',
      _orgId: orgId,
      _created: new Date(),
      _createdBy: isPostgres ? 1 : '507f1f77bcf86cd799439011',
      _updated: new Date(),
      _updatedBy: isPostgres ? 1 : '507f1f77bcf86cd799439011',
    });

    expect(encoded._id).toBe(id);
    expect(encoded.name).toBe('Item');
    expect(encoded._orgId).toBe(orgId);
    expect(encoded._created).toBeUndefined();
    expect(encoded._createdBy).toBeUndefined();
    expect(encoded._updated).toBeUndefined();
    expect(encoded._updatedBy).toBeUndefined();
  });

  it('does not add identity fields when the source spec is not an entity', () => {
    const spec = entityUtils.getModelSpec(Type.Object({ name: Type.String() }), { isEntity: false });
    const publicSpec = createPublicSpec(spec);
    const encoded = publicSpec.encode({
      _id: '507f1f77bcf86cd799439011',
      name: 'Item',
    });

    expect(publicSpec.isEntity).toBe(false);
    expect(publicSpec.isAuditable).toBe(false);
    expect(encoded._id).toBeUndefined();
    expect(encoded.name).toBe('Item');
  });
});

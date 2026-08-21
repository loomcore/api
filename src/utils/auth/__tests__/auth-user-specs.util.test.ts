import { UserContextSpec } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import { Type } from '@sinclair/typebox';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLoginResponseSpec,
  getAuthUserContextSpec,
} from '../auth-user-specs.util.js';

describe('auth-user-specs', () => {
  it('creates a login response spec from a user context spec', () => {
    const loginResponseSpec = createLoginResponseSpec(UserContextSpec);
    const loginEncoded = loginResponseSpec.encode({
      tokens: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresOn: 1,
      },
      userContext: {
        user: {
          _id: '507f1f77bcf86cd799439011',
          email: 'test@example.com',
          password: 'hashed',
          _created: new Date('2024-01-01T00:00:00.000Z'),
          _createdBy: '507f1f77bcf86cd799439011',
        },
        features: [],
        organization: {
          _id: '507f1f77bcf86cd799439012',
          name: 'Test Org',
          code: 'test',
          _created: new Date('2024-01-01T00:00:00.000Z'),
          _createdBy: '507f1f77bcf86cd799439011',
        },
      },
    });

    expect(loginEncoded.tokens.accessToken).toBe('a');
    expect(loginEncoded.userContext.user.email).toBe('test@example.com');
  });

  it('registers the JWT user context spec used by auth middleware', () => {
    expect(getAuthUserContextSpec()).toBe(UserContextSpec);

    const custom = entityUtils.getModelSpec(Type.Object({}), {
      isEntity: false,
    });
    createLoginResponseSpec(custom);
    expect(getAuthUserContextSpec()).toBe(custom);
  });
});

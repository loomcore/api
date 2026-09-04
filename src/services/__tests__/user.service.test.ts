import type { IQueryOptions } from '@loomcore/common/models';
import { initializeTypeBox } from '@loomcore/common/validation';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import {
  getTestMetaOrgAdminUserContext,
  getTestMetaOrgUser,
  getTestMetaOrgUserContext,
  getTestOrgUser,
} from '../../__tests__/test-objects.js';
import { BadRequestError } from '../../errors/index.js';
import { passwordUtils } from '../../utils/password.utils.js';
import { UserService } from '../user.service.js';

const PASSWORD_ON_ENTITY_MESSAGE = 'Cannot update user with password present on the entity.';
const EMPTY_PASSWORD_MESSAGE = 'Password cannot be empty.';

beforeAll(() => {
  initializeTypeBox();
});

describe('UserService', () => {
  let service: UserService;

  beforeAll(async () => {
    const setup = await TestExpressApp.init();
    testUtils.initialize(setup.database);
    service = new UserService(setup.database);
  });

  afterAll(async () => {
    await testUtils.cleanup();
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
  });

  describe('getById', () => {
    it('should allow a user to get themselves', async () => {
      const user = await service.getById(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id);

      expect(user._id).toEqual(getTestMetaOrgUser()._id);
    });

    it('should allow getting another user in the same tenant', async () => {
      const created = await service.create(getTestMetaOrgAdminUserContext(), {
        email: 'another-meta-user@example.com',
        displayName: 'Another Meta User',
        password: 'password123!',
        externalId: 'another-meta-user',
      });
      expect(created).toBeTruthy();

      const user = await service.getById(getTestMetaOrgAdminUserContext(), created!._id);

      expect(user._id).toEqual(created!._id);
    });
  });

  describe('get / getAll / getCount', () => {
    it('should allow get, getAll, and getCount', async () => {
      const adminContext = getTestMetaOrgAdminUserContext();

      const paged = await service.get(adminContext);
      expect(paged.entities?.length).toBeGreaterThan(0);

      const all = await service.getAll(adminContext);
      expect(all.length).toBeGreaterThan(0);

      const count = await service.getCount(adminContext);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('should reject updates that include a password', async () => {
      const queryObject: IQueryOptions = {
        filters: { _id: { eq: getTestMetaOrgUser()._id } },
      };

      await expect(service.update(getTestMetaOrgAdminUserContext(), queryObject, {
        password: 'new-password',
      })).rejects.toThrow(BadRequestError);

      await expect(service.update(getTestMetaOrgAdminUserContext(), queryObject, {
        password: 'new-password',
      })).rejects.toThrow(PASSWORD_ON_ENTITY_MESSAGE);
    });

    it('should allow updates that do not include a password', async () => {
      const queryObject: IQueryOptions = {
        filters: { _id: { eq: getTestMetaOrgUser()._id } },
      };

      const updatedUsers = await service.update(getTestMetaOrgAdminUserContext(), queryObject, {
        displayName: 'Updated Display Name',
      });

      expect(updatedUsers).toHaveLength(1);
      expect(updatedUsers[0].displayName).toBe('Updated Display Name');
    });
  });

  describe('batchUpdate', () => {
    it('should reject batch updates when any entity includes a password', async () => {
      await expect(service.batchUpdate(getTestMetaOrgAdminUserContext(), [
        {
          _id: getTestMetaOrgUser()._id,
          password: 'new-password',
        },
      ])).rejects.toThrow(BadRequestError);

      await expect(service.batchUpdate(getTestMetaOrgAdminUserContext(), [
        {
          _id: getTestMetaOrgUser()._id,
          password: 'new-password',
        },
      ])).rejects.toThrow(PASSWORD_ON_ENTITY_MESSAGE);
    });

    it('should reject batch updates when only one entity in the batch includes a password', async () => {
      await expect(service.batchUpdate(getTestMetaOrgAdminUserContext(), [
        {
          _id: getTestMetaOrgUser()._id,
          displayName: 'Updated Meta Org User',
        },
        {
          _id: getTestOrgUser()._id,
          password: 'new-password',
        },
      ])).rejects.toThrow(BadRequestError);

      await expect(service.batchUpdate(getTestMetaOrgAdminUserContext(), [
        {
          _id: getTestMetaOrgUser()._id,
          displayName: 'Updated Meta Org User',
        },
        {
          _id: getTestOrgUser()._id,
          password: 'new-password',
        },
      ])).rejects.toThrow(PASSWORD_ON_ENTITY_MESSAGE);
    });

    it('should allow batch updates when no entities include a password', async () => {
      const updatedUsers = await service.batchUpdate(getTestMetaOrgAdminUserContext(), [
        {
          _id: getTestMetaOrgUser()._id,
          displayName: 'Updated Meta Org User',
        },
      ]);

      expect(updatedUsers).toHaveLength(1);
      expect(updatedUsers[0].displayName).toBe('Updated Meta Org User');
    });
  });

  describe('partialUpdateById', () => {
    it('should reject updates that include a password', async () => {
      await expect(service.partialUpdateById(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, {
        password: 'new-password',
      })).rejects.toThrow(BadRequestError);

      await expect(service.partialUpdateById(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, {
        password: 'new-password',
      })).rejects.toThrow(PASSWORD_ON_ENTITY_MESSAGE);
    });

    it('should allow partial updates that do not include a password', async () => {
      const updatedUser = await service.partialUpdateById(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, {
        displayName: 'Updated Display Name',
      });

      expect(updatedUser.displayName).toBe('Updated Display Name');
    });

    it('should allow partial user updates', async () => {
      const updatedUser = await service.partialUpdateById(getTestMetaOrgAdminUserContext(), getTestOrgUser()._id, {
        displayName: 'Admin Updated',
      });

      expect(updatedUser.displayName).toBe('Admin Updated');
    });
  });

  describe('changePassword', () => {
    it('should reject empty string passwords', async () => {
      await expect(service.changePassword(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, ''))
        .rejects.toThrow(BadRequestError);

      await expect(service.changePassword(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, ''))
        .rejects.toThrow(EMPTY_PASSWORD_MESSAGE);
    });

    it('should hash the password and set _lastPasswordChange', async () => {
      const newPassword = 'newSecurePassword123!';

      const updatedUser = await service.changePassword(getTestMetaOrgUserContext(), getTestMetaOrgUser()._id, newPassword);

      expect(updatedUser.password).toBeDefined();
      expect(updatedUser.password).not.toEqual(newPassword);

      const isPasswordCorrect = await passwordUtils.comparePasswords(updatedUser.password ?? '', newPassword);
      expect(isPasswordCorrect).toBe(true);
      expect(updatedUser._lastPasswordChange).toBeInstanceOf(Date);
      expect(Date.now() - updatedUser._lastPasswordChange!.getTime()).toBeLessThan(5000);
    });
  });
});

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { initializeTypeBox } from '@loomcore/common/validation';
import { IOrganization, IUserContext } from '@loomcore/common/models';

import { OrganizationService } from '../organization.service.js';
import { BadRequestError } from '../../errors/index.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import testUtils from '../../__tests__/common-test.utils.js';
import { testMetaOrgUserContext, testMetaOrg, testOrgUserContext, getTestMetaOrgUser } from '../../__tests__/test-objects.js';

// Initialize TypeBox before running any tests
beforeAll(() => {
    initializeTypeBox();
});

describe('OrganizationService', () => {
    let service: OrganizationService;

    // Set up the test environment once before all tests
    beforeAll(async () => {
        const setup = await TestExpressApp.init();
        testUtils.initialize(setup.database);

        // Create service with real database
        service = new OrganizationService(setup.database);
    });

    afterAll(async () => {
        await testUtils.cleanup();
        await TestExpressApp.cleanup();
    });

    // Set up before each test
    beforeEach(async () => {
        await TestExpressApp.clearCollections();
    });

    describe('preprocessEntity', () => {
        it('should throw BadRequestError when trying to create a metaOrg if one already exists', async () => {
            // Arrange: Create the first metaOrg
            const firstMetaOrg: Partial<IOrganization> = {
                name: 'First Meta Organization',
                code: 'first-meta-org',
                status: 1,
                isMetaOrg: true,
            };

            await service.create(testMetaOrgUserContext, firstMetaOrg);

            // Act & Assert: Try to create a second metaOrg and expect BadRequestError
            const secondMetaOrg: Partial<IOrganization> = {
                name: 'Second Meta Organization',
                code: 'second-meta-org',
                status: 1,
                isMetaOrg: true,
            };

            await expect(
                service.create(testMetaOrgUserContext, secondMetaOrg)
            ).rejects.toThrow(BadRequestError);

            await expect(
                service.create(testMetaOrgUserContext, secondMetaOrg)
            ).rejects.toThrow('Meta organization already exists');
        });

        it('should allow creating a metaOrg when none exists', async () => {
            // Arrange
            const metaOrg: Partial<IOrganization> = {
                name: 'Test Meta Organization',
                code: 'test-meta-org',
                status: 1,
                isMetaOrg: true,
            };

            // Act
            const result = await service.create(testMetaOrgUserContext, metaOrg);

            // Assert
            expect(result).toBeDefined();
            expect(result?.isMetaOrg).toBe(true);
            expect(result?.name).toBe('Test Meta Organization');
        });

        it('should throw BadRequestError when non-metaOrg user tries to create an organization', async () => {
            // Arrange: Create a metaOrg first
            const metaOrg: Partial<IOrganization> = {
                name: 'Test Meta Organization',
                code: 'test-meta-org',
                status: 1,
                isMetaOrg: true,
            };

            const createdMetaOrg = await service.create(testMetaOrgUserContext, metaOrg);
            expect(createdMetaOrg).toBeDefined();

            // Act & Assert: Try to create a regular org with a non-metaOrg userContext
            const regularOrg: Partial<IOrganization> = {
                name: 'Regular Organization',
                code: 'regular-org',
                status: 1,
                isMetaOrg: false,
            };

            await expect(
                service.create(testOrgUserContext, regularOrg)
            ).rejects.toThrow(BadRequestError);

            await expect(
                service.create(testOrgUserContext, regularOrg)
            ).rejects.toThrow('User is not authorized to create an organization');
        });

        it('should allow metaOrg user to create a regular organization', async () => {
            // Arrange: Create a metaOrg first
            const metaOrg: Partial<IOrganization> = {
                name: 'Test Meta Organization',
                code: 'test-meta-org',
                status: 1,
                isMetaOrg: true,
            };

            const createdMetaOrg = await service.create(testMetaOrgUserContext, metaOrg);
            expect(createdMetaOrg).toBeDefined();
            expect(createdMetaOrg?._id).toBeDefined();

            if (!createdMetaOrg || !createdMetaOrg._id) {
                throw new Error('Failed to create metaOrg for test');
            }

            // Create a userContext with the actual metaOrg _id
            const metaOrgUserContext: IUserContext = {
                user: getTestMetaOrgUser(),
                _orgId: createdMetaOrg._id,
            };

            // Act: Create a regular org with metaOrg userContext
            const regularOrg: Partial<IOrganization> = {
                name: 'Regular Organization',
                code: 'regular-org',
                status: 1,
                isMetaOrg: false,
            };

            const result = await service.create(metaOrgUserContext, regularOrg);

            // Assert
            expect(result).toBeDefined();
            expect(result?.isMetaOrg).toBe(false);
            expect(result?.name).toBe('Regular Organization');
        });
    });
});


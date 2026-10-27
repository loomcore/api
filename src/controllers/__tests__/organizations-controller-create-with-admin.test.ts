import { getSystemUserContext } from '@loomcore/common/models';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import testUtils from '../../__tests__/common-test.utils.js';
import { TestExpressApp } from '../../__tests__/test-express-app.js';
import { getTestMetaOrgUser, getTestOrg } from '../../__tests__/test-objects.js';
import { config } from '../../config/index.js';
import { EmailService } from '../../services/email.service.js';
import { AuthorizationService } from '../../services/authorization.service.js';
import { OrganizationDomainService } from '../../services/organization-domain.service.js';
import {
  buildOrganizationClientBaseUrl,
  buildOrganizationTenantDomain,
  OrganizationService,
} from '../../services/organization.service.js';
import { UserService } from '../../services/user.service.js';
import { OrganizationsController } from '../organizations.controller.js';

describe('OrganizationsController.createOrganizationWithAdmin', () => {
  const apiEndpoint = '/api/organizations/create-with-admin';
  let testAgent: any;
  let database: Awaited<ReturnType<typeof TestExpressApp.init>>['database'];
  let organizationService: OrganizationService;
  let organizationDomainService: OrganizationDomainService;
  let userService: UserService;
  let authorizationService: AuthorizationService;

  beforeAll(async () => {
    const testSetup = await TestExpressApp.init();
    testAgent = testSetup.agent;
    database = testSetup.database;
    testUtils.initialize(database);

    organizationService = new OrganizationService(database);
    organizationDomainService = new OrganizationDomainService(database);
    userService = new UserService(database);
    authorizationService = new AuthorizationService(database);

    new OrganizationsController(testSetup.app, database);
    await TestExpressApp.setupErrorHandling();
  });

  afterAll(async () => {
    await TestExpressApp.cleanup();
  });

  beforeEach(async () => {
    await TestExpressApp.clearCollections();
    await testUtils.setupTestUsers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Acme Tenant',
      code: 'acme',
      adminEmail: 'acme-admin@example.com',
      adminDisplayName: 'Acme Admin',
      ...overrides,
    };
  }

  it('creates the org, domain, admin user and authorization records, and sends a welcome email', async () => {
    const sendWelcomeEmailSpy = vi.spyOn(EmailService.prototype, 'sendWelcomeEmail').mockResolvedValue();
    const sendResetPasswordEmailSpy = vi.spyOn(EmailService.prototype, 'sendResetPasswordEmail').mockResolvedValue();
    const payload = validPayload();

    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body?.data?.organization?.name).toBe(payload.name);
    expect(response.body?.data?.organization?.code).toBe(payload.code);
    expect(response.body?.data?.organization?.isMetaOrg).toBe(false);
    expect(response.body?.data?.organization?._id).toBeDefined();
    expect(response.body?.data?.adminUser?.email).toBe(payload.adminEmail);
    expect(response.body?.data?.adminUser?.displayName).toBe(payload.adminDisplayName);
    expect(response.body?.data?.adminUser?.password).toBeUndefined();
    expect(response.body?.data?.adminUser?._orgId).toBe(response.body?.data?.organization?._id);

    const expectedDomain = buildOrganizationTenantDomain(payload.code);
    expect(expectedDomain).toBe(`${payload.code}.${config.network.hostName}`);

    const createdOrg = await organizationService.findByDomain(getSystemUserContext(), expectedDomain);
    expect(createdOrg?._id).toBe(response.body?.data?.organization?._id);

    const domainRecord = await organizationDomainService.findOne(getSystemUserContext(), {
      filters: { domain: { eq: expectedDomain } },
    });
    expect(domainRecord?.organizationId).toBeDefined();
    expect(String(domainRecord?.organizationId)).toBe(String(createdOrg?._id));

    const storedUser = await userService.findOne(getSystemUserContext(), {
      filters: { email: { eq: payload.adminEmail } },
    });
    expect(storedUser).toBeDefined();
    expect(storedUser?.password).toBeDefined();
    expect(storedUser?.password).not.toBe(payload.adminEmail);

    const features = await authorizationService.getUserContextFeatures(storedUser!);
    expect(features).toEqual(['admin']);

    expect(sendWelcomeEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendResetPasswordEmailSpy).not.toHaveBeenCalled();
    const [toEmail, setPasswordLink] = sendWelcomeEmailSpy.mock.calls[0];
    expect(toEmail).toBe(payload.adminEmail);
    expect(setPasswordLink).toContain(`${buildOrganizationClientBaseUrl(payload.code)}/reset-password/`);
    expect(setPasswordLink).toContain(encodeURIComponent(payload.adminEmail));
    expect(setPasswordLink).not.toContain('undefined');
  });

  it('rejects invalid organization codes with 400', async () => {
    const invalidCodes = ['Acme', '-acme', 'acme-', 'acme.code', 'acme_code', 'a'.repeat(64), ''];

    for (const code of invalidCodes) {
      const response = await testAgent
        .post(apiEndpoint)
        .set('Authorization', testUtils.getAdminAuthToken())
        .send(validPayload({ code }));

      expect(response.status, `expected 400 for code "${code}"`).toBe(400);
      expect(response.body?.errors?.[0]?.message).toBeDefined();
    }
  });

  it('rejects missing name, code, and admin email with 400', async () => {
    const missingName = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send({ code: 'acme', adminEmail: 'acme-admin@example.com' });
    expect(missingName.status).toBe(400);
    expect(missingName.body?.errors?.[0]?.message).toContain('name');

    const missingCode = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send({ name: 'Acme Tenant', adminEmail: 'acme-admin@example.com' });
    expect(missingCode.status).toBe(400);
    expect(missingCode.body?.errors?.[0]?.message).toContain('code');

    const missingEmail = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send({ name: 'Acme Tenant', code: 'acme' });
    expect(missingEmail.status).toBe(400);
    expect(missingEmail.body?.errors?.[0]?.message).toContain('email');
  });

  it('rejects a caller-supplied password with 400', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(validPayload({ password: 'should-not-be-sent' }));

    expect(response.status).toBe(400);
    expect(response.body?.errors?.[0]?.message).toContain('Password must not be provided');
  });

  it('rejects a duplicate organization name with 400', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(validPayload({ name: getTestOrg().name, code: 'other-tenant', adminEmail: 'other-admin@example.com' }));

    expect(response.status).toBe(400);
    expect(response.body?.errors?.[0]?.message).toBe('Organization name is already in use.');
  });

  it('rejects a duplicate organization code with 400', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(validPayload({ name: 'Other Tenant', code: getTestOrg().code, adminEmail: 'other-admin@example.com' }));

    expect(response.status).toBe(400);
    expect(response.body?.errors?.[0]?.message).toBe('Organization code is already in use.');
  });

  it('rejects a duplicate tenant domain with 400', async () => {
    const code = 'taken-domain';
    await organizationDomainService.create(getSystemUserContext(), {
      organizationId: getTestOrg()._id,
      domain: buildOrganizationTenantDomain(code),
    });

    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(validPayload({ name: 'Taken Domain Tenant', code, adminEmail: 'taken-domain@example.com' }));

    expect(response.status).toBe(400);
    expect(response.body?.errors?.[0]?.message).toBe('Organization domain is already in use.');
  });

  it('rejects a duplicate admin email with 400', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAdminAuthToken())
      .send(validPayload({ adminEmail: getTestMetaOrgUser().email }));

    expect(response.status).toBe(400);
    expect(response.body?.errors?.[0]?.message).toBe('Admin email is already in use.');
  });

  it('rejects unauthenticated requests', async () => {
    const response = await testAgent.post(apiEndpoint).send(validPayload());
    expect(response.status).toBe(401);
  });

  it('rejects a meta-org user who is not an admin', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getAuthToken())
      .send(validPayload());

    expect(response.status).toBe(403);
  });

  it('rejects a tenant-org admin who is not in the meta organization', async () => {
    const response = await testAgent
      .post(apiEndpoint)
      .set('Authorization', testUtils.getOrgAdminAuthToken())
      .send(validPayload());

    expect(response.status).toBe(403);
    expect(response.body?.errors?.[0]?.message).toContain('meta organization');
  });
});

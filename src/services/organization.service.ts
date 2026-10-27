import {
  getSystemUserContext,
  type IOrganization,
  type IUser,
  type IUserContext,
  OrganizationSpec,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { config } from '../config/index.js';
import type { IDatabase } from '../databases/models/index.js';
import { BadRequestError, ServerError } from '../errors/index.js';
import { initiatePasswordReset } from '../utils/auth/initiate-password-reset.util.js';
import { logger } from '../utils/logger.utils.js';
import { passwordUtils } from '../utils/password.utils.js';
import { stringUtils } from '../utils/string.utils.js';
import { AuthorizationService } from './authorization.service.js';
import { FeatureService } from './feature.service.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { OrganizationDomainService } from './organization-domain.service.js';
import { PasswordResetTokenService } from './password-reset-token.service.js';
import { RoleService } from './role.service.js';
import { UserRoleService } from './user-role.service.js';
import { UserService } from './user.service.js';

/** Matches initial-data seeding for tenant and meta-org admins. */
const ADMIN_ROLE_AND_FEATURE_NAME = 'admin';
const DEFAULT_ADMIN_DISPLAY_NAME = 'Admin User';
const DEFAULT_ORGANIZATION_STATUS = 1;

export interface ICreateOrganizationWithAdminInput {
  name: string;
  code: string;
  adminEmail: string;
  adminDisplayName?: string;
}

export interface ICreateOrganizationWithAdminResult {
  organization: IOrganization;
  adminUser: IUser;
}

type CreatedOrganizationRecords = {
  organizationId?: AppIdType;
  domainId?: AppIdType;
  userId?: AppIdType;
  roleId?: AppIdType;
  featureId?: AppIdType;
  userRoleId?: AppIdType;
  authorizationId?: AppIdType;
};

/**
 * Tenant login host: `${code}.${config.network.hostName}`.
 * hostName is the client domain in prod and `dev.<client-domain>` in dev,
 * so dev yields `<code>.dev.<client-domain>`.
 */
export function buildOrganizationTenantDomain(code: string): string {
  const hostName = config.network?.hostName;
  if (!hostName) {
    throw new ServerError('network.hostName is not configured');
  }
  return `${code}.${hostName}`;
}

/**
 * Origin the new tenant's client app is served from. Login resolves the org from the Referer host
 * via organizationDomains, so this must match the stored domain (https, no API port).
 */
export function buildOrganizationClientBaseUrl(code: string): string {
  return `https://${buildOrganizationTenantDomain(code)}`;
}

export class OrganizationService extends GenericApiService<IOrganization> {
  private organizationDomainService: OrganizationDomainService;

  constructor(database: IDatabase) {
    super(database, 'organizations', 'organization', OrganizationSpec);
    this.organizationDomainService = new OrganizationDomainService(database);
  }

  override async preProcessEntity(
    userContext: IUserContext,
    entity: Partial<IOrganization>,
    isCreate: boolean,
    allowId: boolean = true,
  ): Promise<Partial<IOrganization>> {
    if (isCreate) {
      const metaOrg = await this.getMetaOrg(userContext);
      if (metaOrg && entity.isMetaOrg) {
        throw new BadRequestError('Meta organization already exists');
      }
      if (metaOrg && userContext.user._orgId !== metaOrg._id) {
        throw new BadRequestError(
          'User is not authorized to create an organization',
        );
      }
    }
    const result = await super.preProcessEntity(
      userContext,
      entity,
      isCreate,
      allowId,
    );
    return result;
  }

  // TODO: override prepareQuery to add check for isMetaOrg.
  // If user is not meta org, throw error.
  async getAuthTokenByRepoCode(
    userContext: IUserContext,
    orgId: AppIdType,
  ): Promise<string | null> {
    // until we implement repos, we use orgId - repos are a feature providing separate data repositories for a single org
    const org = await this.getById(userContext, orgId);
    return org?.authToken ?? null;
  }

  async validateRepoAuthToken(
    userContext: IUserContext,
    orgCode: string,
    authToken: string,
  ): Promise<AppIdType | null> {
    // this is used to auth content-api calls - the orgCode is used in the api call hostname
    const org = await this.findOne(userContext, {
      filters: { code: { eq: orgCode } },
    });

    if (!org) {
      return null;
    }

    const orgId = org.authToken === authToken ? org._id : null;

    return orgId;
  }

  async getMetaOrg(userContext: IUserContext): Promise<IOrganization | null> {
    return this.findOne(userContext, {
      filters: { isMetaOrg: { eq: true } },
    });
  }

  async findByDomain(
    userContext: IUserContext,
    domain: string,
  ): Promise<IOrganization | null> {
    if (!domain) {
      throw new BadRequestError(
        'Missing required fields: domain is required.',
      );
    }
    const organizationDomain = await this.organizationDomainService.findOne(
      userContext,
      {
        filters: { domain: { eq: domain } },
      },
    );
    if (!organizationDomain) {
      return null;
    }
    return this.findOne(userContext, {
      filters: { _id: { eq: organizationDomain.organizationId } },
    });
  }

  /**
   * Create a tenant organization, its login domain, and an org-admin user, then email a set-password link.
   * Intended for meta-org admin callers today; self-service signup can reuse this method later.
   */
  async createOrganizationWithAdmin(
    userContext: IUserContext,
    input: ICreateOrganizationWithAdminInput,
  ): Promise<ICreateOrganizationWithAdminResult> {
    const parsed = this.parseCreateOrganizationWithAdminInput(input);
    const domain = buildOrganizationTenantDomain(parsed.code);
    await this.assertCreateOrganizationWithAdminUniqueness(userContext, parsed, domain);

    const created: CreatedOrganizationRecords = {};
    const userService = new UserService(this.database);
    const roleService = new RoleService(this.database);
    const featureService = new FeatureService(this.database);
    const userRoleService = new UserRoleService(this.database);
    const authorizationService = new AuthorizationService(this.database);

    try {
      const organization = await this.create(userContext, {
        name: parsed.name,
        code: parsed.code,
        status: DEFAULT_ORGANIZATION_STATUS,
        isMetaOrg: false,
      });
      if (!organization?._id) {
        throw new ServerError('Failed to create organization');
      }
      created.organizationId = organization._id;

      const organizationDomain = await this.organizationDomainService.create(userContext, {
        organizationId: organization._id,
        domain,
      });
      if (!organizationDomain?._id) {
        throw new ServerError('Failed to create organization domain');
      }
      created.domainId = organizationDomain._id;

      const adminUser = await userService.create(userContext, {
        _orgId: organization._id,
        email: parsed.adminEmail,
        displayName: parsed.adminDisplayName,
        password: passwordUtils.generateRandomPassword(),
      });
      if (!adminUser?._id) {
        throw new ServerError('Failed to create organization admin user');
      }
      created.userId = adminUser._id;

      const role = await roleService.create(userContext, {
        _orgId: organization._id,
        name: ADMIN_ROLE_AND_FEATURE_NAME,
      });
      if (!role?._id) {
        throw new ServerError('Failed to create organization admin role');
      }
      created.roleId = role._id;

      const feature = await featureService.create(userContext, {
        _orgId: organization._id,
        name: ADMIN_ROLE_AND_FEATURE_NAME,
      });
      if (!feature?._id) {
        throw new ServerError('Failed to create organization admin feature');
      }
      created.featureId = feature._id;

      const userRole = await userRoleService.create(userContext, {
        _orgId: organization._id,
        userId: adminUser._id,
        roleId: role._id,
      });
      if (!userRole?._id) {
        throw new ServerError('Failed to create organization admin user role');
      }
      created.userRoleId = userRole._id;

      const authorization = await authorizationService.create(userContext, {
        _orgId: organization._id,
        roleId: role._id,
        featureId: feature._id,
      });
      if (!authorization?._id) {
        throw new ServerError('Failed to create organization admin authorization');
      }
      created.authorizationId = authorization._id;

      // clientBaseUrl is the new tenant origin so the set-password link lands on that org's host
      // (login resolves org from Referer via organizationDomains).
      await initiatePasswordReset(
        getSystemUserContext(),
        this.database,
        organization._id,
        parsed.adminEmail,
        buildOrganizationClientBaseUrl(parsed.code),
        'welcome',
      );

      logger.info(`Created organization ${parsed.code} with admin ${parsed.adminEmail}`);

      const { password: _password, ...adminUserWithoutPassword } = adminUser;
      return {
        organization,
        adminUser: adminUserWithoutPassword as IUser,
      };
    } catch (error) {
      await this.cleanupCreatedOrganizationWithAdmin(created, parsed.adminEmail);
      throw error;
    }
  }

  private parseCreateOrganizationWithAdminInput(
    input: ICreateOrganizationWithAdminInput,
  ): { name: string; code: string; adminEmail: string; adminDisplayName: string } {
    if (!input || typeof input !== 'object') {
      throw new BadRequestError('Request body is required.');
    }

    const rawInput = input as ICreateOrganizationWithAdminInput & Record<string, unknown>;
    if ('password' in rawInput && rawInput.password !== undefined) {
      throw new BadRequestError('Password must not be provided. The admin will set their password via the welcome email.');
    }
    if ('adminPassword' in rawInput && rawInput.adminPassword !== undefined) {
      throw new BadRequestError('Password must not be provided. The admin will set their password via the welcome email.');
    }

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const code = typeof input.code === 'string' ? input.code : '';
    const adminEmail = typeof input.adminEmail === 'string' ? input.adminEmail.trim().toLowerCase() : '';
    if (input.adminDisplayName !== undefined && typeof input.adminDisplayName !== 'string') {
      throw new BadRequestError('Admin display name must be a string.');
    }
    const adminDisplayName = input.adminDisplayName === undefined ? DEFAULT_ADMIN_DISPLAY_NAME : input.adminDisplayName;

    if (!name) {
      throw new BadRequestError('Organization name is required.');
    }
    if (!code) {
      throw new BadRequestError('Organization code is required.');
    }
    if (!stringUtils.isValidDnsLabel(code)) {
      throw new BadRequestError(
        'Organization code must be a valid DNS label: lowercase letters, digits, and hyphens, with no leading or trailing hyphen.',
      );
    }
    if (!adminEmail) {
      throw new BadRequestError('Admin email is required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new BadRequestError('Admin email is not a valid email address.');
    }

    return { name, code, adminEmail, adminDisplayName };
  }

  private async assertCreateOrganizationWithAdminUniqueness(
    userContext: IUserContext,
    parsed: { name: string; code: string; adminEmail: string },
    domain: string,
  ): Promise<void> {
    const existingByName = await this.findOne(userContext, {
      filters: { name: { eq: parsed.name } },
    });
    if (existingByName) {
      throw new BadRequestError('Organization name is already in use.');
    }

    const existingByCode = await this.findOne(userContext, {
      filters: { code: { eq: parsed.code } },
    });
    if (existingByCode) {
      throw new BadRequestError('Organization code is already in use.');
    }

    const existingDomain = await this.organizationDomainService.findOne(userContext, {
      filters: { domain: { eq: domain } },
    });
    if (existingDomain) {
      throw new BadRequestError('Organization domain is already in use.');
    }

    const userService = new UserService(this.database);
    const existingUser = await userService.findOne(getSystemUserContext(), {
      filters: { email: { eq: parsed.adminEmail } },
    });
    if (existingUser) {
      throw new BadRequestError('Admin email is already in use.');
    }
  }

  private async cleanupCreatedOrganizationWithAdmin(
    created: CreatedOrganizationRecords,
    adminEmail: string,
  ): Promise<void> {
    const systemUserContext = getSystemUserContext();
    const userService = new UserService(this.database);
    const roleService = new RoleService(this.database);
    const featureService = new FeatureService(this.database);
    const userRoleService = new UserRoleService(this.database);
    const authorizationService = new AuthorizationService(this.database);
    const passwordResetTokenService = new PasswordResetTokenService(this.database);

    const deleteByIdIfPresent = async (
      label: string,
      deleteById: (userContext: IUserContext, id: AppIdType) => Promise<unknown>,
      id: AppIdType | undefined,
    ) => {
      if (id === undefined) {
        return;
      }
      try {
        await deleteById(systemUserContext, id);
      } catch (cleanupError) {
        logger.error(`Failed to clean up ${label} ${String(id)} after createOrganizationWithAdmin error`, cleanupError);
      }
    };

    if (created.organizationId !== undefined) {
      try {
        await passwordResetTokenService.deleteMany(systemUserContext, {
          filters: { email: { eq: adminEmail }, _orgId: { eq: created.organizationId } },
        });
      } catch (cleanupError) {
        logger.error('Failed to clean up password reset tokens after createOrganizationWithAdmin error', cleanupError);
      }
    }

    await deleteByIdIfPresent('authorization', authorizationService.deleteById.bind(authorizationService), created.authorizationId);
    await deleteByIdIfPresent('userRole', userRoleService.deleteById.bind(userRoleService), created.userRoleId);
    await deleteByIdIfPresent('feature', featureService.deleteById.bind(featureService), created.featureId);
    await deleteByIdIfPresent('role', roleService.deleteById.bind(roleService), created.roleId);
    await deleteByIdIfPresent('user', userService.deleteById.bind(userService), created.userId);
    await deleteByIdIfPresent('organizationDomain', this.organizationDomainService.deleteById.bind(this.organizationDomainService), created.domainId);
    await deleteByIdIfPresent('organization', this.deleteById.bind(this), created.organizationId);
  }
}

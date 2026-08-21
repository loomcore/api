import {
  AuthorizationModelSpec,
  getSystemUserContext,
  type IAuthorization,
  type IQueryOptions,
  type IUser,
  type IUserContext,
} from '@loomcore/common/models';
import type { IDatabase } from '../databases/index.js';
import { assertUserHasFeature } from '../utils/index.js';
import { FeaturesService } from './features.service.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import { UserRolesService } from './user-roles.service.js';

export class AuthorizationsService extends MultiTenantApiService<IAuthorization> {
  private userRolesService: UserRolesService;
  private featuresService: FeaturesService;

  constructor(database: IDatabase) {
    super(database, 'authorizations', 'authorization', AuthorizationModelSpec);
    this.userRolesService = new UserRolesService(database);
    this.featuresService = new FeaturesService(database);
  }

  override async preProcessEntity(
    userContext: IUserContext,
    entity: Partial<IAuthorization>,
    isCreate: boolean,
    allowId: boolean = true,
  ): Promise<Partial<IAuthorization>> {
    assertUserHasFeature(userContext, ['admin', 'system', 'authorizations']);
    return super.preProcessEntity(userContext, entity, isCreate, allowId);
  }

  /**
   * Resolves the current feature names for a user via userRoles → authorizations → features.
   * Uses the system user context so this works during login/refresh (no authenticated context yet).
   */
  async getUserContextFeatures(user: IUser): Promise<string[]> {
    const systemUserContext = getSystemUserContext();
    const now = new Date();

    const userRoleQueryOptions: IQueryOptions = {
      filters: { userId: { eq: user._id } },
    };
    if (user._orgId !== undefined) {
      userRoleQueryOptions.filters!._orgId = { eq: user._orgId };
    }

    const userRoles = await this.userRolesService.find(
      systemUserContext,
      userRoleQueryOptions,
    );
    const roleIds = [
      ...new Set(
        userRoles
          .filter((userRole) => !userRole._deleted)
          .map((userRole) => userRole.roleId),
      ),
    ];
    if (roleIds.length === 0) {
      return [];
    }

    const authorizationQuery: IQueryOptions = {
      filters: { roleId: { in: roleIds } },
    };
    if (user._orgId !== undefined) {
      authorizationQuery.filters!._orgId = { eq: user._orgId };
    }

    const authorizations = await this.find(
      systemUserContext,
      authorizationQuery,
    );
    const featureIds = [
      ...new Set(
        authorizations
          .filter(
            (authorization) =>
              !authorization._deleted &&
              (!authorization.startDate || authorization.startDate <= now) &&
              (!authorization.endDate || authorization.endDate >= now),
          )
          .map((authorization) => authorization.featureId),
      ),
    ];
    if (featureIds.length === 0) {
      return [];
    }

    const featureQuery: IQueryOptions = {
      filters: { _id: { in: featureIds } },
    };
    if (user._orgId !== undefined) {
      featureQuery.filters!._orgId = { eq: user._orgId };
    }

    const features = await this.featuresService.find(
      systemUserContext,
      featureQuery,
    );

    return [...new Set(features.map((feature) => feature.name))];
  }
}

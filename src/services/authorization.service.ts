import {
  AuthorizationModelSpec,
  type IAuthorization,
  type IQueryOptions,
  type IUser,
} from '@loomcore/common/models';
import type { IDatabase } from '../databases/index.js';
import { FeatureService } from './feature.service.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { createSystemContext } from './request-context.interface.js';
import { UserRoleService } from './user-role.service.js';

export class AuthorizationService extends GenericApiService<IAuthorization> {
  private userRolesService: UserRoleService;
  private featuresService: FeatureService;

  constructor(database: IDatabase) {
    super(database, 'authorization', 'authorizations', AuthorizationModelSpec);
    this.userRolesService = new UserRoleService(database);
    this.featuresService = new FeatureService(database);
  }

  /**
   * Resolves the current feature names for a user via userRoles → authorizations → features.
   * Uses the system context so this works during login/refresh (no authenticated context yet).
   */
  async getUserContextFeatures(user: IUser): Promise<string[]> {
    const systemContext = createSystemContext();
    const now = new Date();

    const userRoleQueryOptions: IQueryOptions = {
      filters: { userId: { eq: user._id } },
    };
    if (user._orgId !== undefined) {
      userRoleQueryOptions.filters!._orgId = { eq: user._orgId };
    }

    const userRoles = await this.userRolesService.find(
      systemContext,
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
      systemContext,
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
      systemContext,
      featureQuery,
    );

    return [...new Set(features.map((feature) => feature.name))];
  }
}

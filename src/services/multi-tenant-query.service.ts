import type { IEntity, IModelSpec, IQueryOptions, IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError, ServerError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import { GenericQueryService } from './generic-query-service/generic-query.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates GenericQueryService with multi-tenancy behavior.
 *
 * Needed because GenericQueryService.getAll/getCount do not use queryOptions, so
 * prepareQuery tenant filters cannot isolate those reads. get() applies
 * prepareQueryOptions to the real query and then calls prepareQuery with {},
 * discarding that method's queryOptions. This class:
 * - overrides getDatabaseOrgId so getAll/getCount pass explicit orgId
 * - overrides prepareQuery so getById's queryOptions include the tenant filter
 * - overrides prepareQueryOptions so paginated get() is tenant-scoped
 *
 * Policy matches MultiTenantApiService: unscoped for single-tenant, system users,
 * and meta org admins; reject when a required tenant call has no _orgId.
 */
export class MultiTenantQueryService<T extends IEntity> extends GenericQueryService<T> {
    private tenantDecorator?: TenantQueryDecorator;

    constructor(
        database: IDatabase,
        rootTableName: string,
        modelSpec: IModelSpec,
        defaultOperations: Operation[] = [],
    ) {
        super(database, rootTableName, modelSpec, defaultOperations);
        if (config?.app?.isMultiTenant) {
            this.tenantDecorator = new TenantQueryDecorator();
        }
    }

    /**
     * Supplies orgId for getAll/getCount. Unscoped for single-tenant, system users,
     * and meta org admins. Throws if a tenant-scoped call is missing _orgId.
     */
    protected override getDatabaseOrgId(userContext: IUserContext): AppIdType | undefined {
        if (!config?.app?.isMultiTenant) {
            return undefined;
        }
        if (isSystemUser(userContext) || isMetaOrgAdmin(userContext)) {
            return undefined;
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext with _orgId is required for multi-tenant operations',
            );
        }
        return userContext.user._orgId;
    }

    /**
     * Adds tenant filtering to queryOptions used by getById.
     */
    override prepareQuery(
        userContext: IUserContext | undefined,
        queryOptions: IQueryOptions,
        operations: Operation[],
    ): { queryOptions: IQueryOptions; operations: Operation[] } {
        const mergedOperations = [...this.defaultOperations, ...operations];

        if (!config?.app?.isMultiTenant || (userContext && isSystemUser(userContext))) {
            return { queryOptions, operations: mergedOperations };
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext was not provided to MultiTenantQueryService.prepareQuery',
            );
        }

        if (!this.tenantDecorator) {
            throw new ServerError(
                'A valid tenantDecorator was not provided to MultiTenantQueryService.prepareQuery',
            );
        }

        queryOptions = this.tenantDecorator.applyTenantToQuery(
            userContext,
            queryOptions,
            this.rootTableName,
        );
        return { queryOptions, operations: mergedOperations };
    }

    /**
     * Adds tenant filtering for paginated get(), which uses prepareQueryOptions
     * on the real query options and discards prepareQuery's queryOptions.
     * Uses applyTenantToQuery (not applyTenantToQueryOptions) so system users
     * and meta org admins stay unscoped, matching MultiTenantApiService.
     */
    override prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions {
        if (!config?.app?.isMultiTenant || (userContext && isSystemUser(userContext))) {
            return queryOptions;
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext was not provided to MultiTenantQueryService.prepareQueryOptions',
            );
        }

        if (!this.tenantDecorator) {
            throw new ServerError(
                'A valid tenantDecorator was not provided to MultiTenantQueryService.prepareQueryOptions',
            );
        }

        return this.tenantDecorator.applyTenantToQuery(
            userContext,
            queryOptions,
            this.rootTableName,
        );
    }
}

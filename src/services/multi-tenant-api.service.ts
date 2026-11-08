import type {
    IEntity,
    IModelSpec,
    IQueryOptions,
    IUserContext,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError } from '../errors/index.js';
import { ServerError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates the GenericApiService with multi-tenancy behavior.
 * Tenant policy lives here: prepareQuery/preProcessEntity plus getDatabaseOrgId
 * for commands that enforce matching _orgId atomically.
 */
export class MultiTenantApiService<T extends IEntity> extends GenericApiService<T> {
    private tenantDecorator?: TenantQueryDecorator;

    constructor(
        database: IDatabase,
        pluralResourceName: string,
        singularResourceName: string,
        modelSpec: IModelSpec,
    ) {
        super(database, pluralResourceName, singularResourceName, modelSpec);
        if (config?.app?.isMultiTenant) {
            this.tenantDecorator = new TenantQueryDecorator();
        }
    }

    /**
     * Supplies orgId for database commands that filter atomically by _orgId.
     * Unscoped (undefined) for single-tenant mode, system users, and meta org admins.
     * Throws if a tenant-scoped call is missing _orgId rather than silently widening.
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
     * Override the query preparation hook to add tenant filtering.
     * Used by methods that pass queryOptions to database operations (get, getById, find, etc.).
     */
    override prepareQuery(
        userContext: IUserContext,
        queryOptions: IQueryOptions,
        operations: Operation[],
    ): { queryOptions: IQueryOptions; operations: Operation[] } {
        if (!config?.app?.isMultiTenant || (userContext && isSystemUser(userContext))) {
            return super.prepareQuery(userContext, queryOptions, operations);
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext was not provided to MultiTenantApiService.prepareQuery',
            );
        }

        if (!this.tenantDecorator) {
            throw new ServerError(
                'A valid tenantDecorator was not provided to MultiTenantApiService.prepareQuery',
            );
        }

        queryOptions = this.tenantDecorator.applyTenantToQuery(
            userContext,
            queryOptions,
            this.pluralResourceName,
        );
        return { queryOptions, operations };
    }

    /**
     * Override the individual entity preparation hook to add tenant ID
     */
    override async preProcessEntity(
        userContext: IUserContext,
        entity: Partial<T>,
        isCreate: boolean,
        allowId: boolean = false,
    ): Promise<Partial<T>> {
        if (!config?.app?.isMultiTenant) {
            return super.preProcessEntity(userContext, entity, isCreate, allowId);
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext was not provided to MultiTenantApiService.prepareEntity',
            );
        }

        const preparedEntity = await super.preProcessEntity(
            userContext,
            entity,
            isCreate,
            allowId,
        );

        if (isCreate && !isSystemUser(userContext) && !isMetaOrgAdmin(userContext)) {
            preparedEntity._orgId = userContext.user._orgId;
        }

        if (isCreate && isMetaOrgAdmin(userContext)) {
            preparedEntity._orgId = preparedEntity._orgId ?? userContext.user._orgId;
        }

        return preparedEntity;
    }
}

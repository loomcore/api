import type {
    IEntity,
    IModelSpec,
    IQueryOptions,
    IUserContext,
} from '@loomcore/common/models';
import { getSystemUserId } from '@loomcore/common/validation';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError } from '../errors/bad-request.error.js';
import { ServerError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates the GenericApiService with multi-tenancy behavior.
 * This implementation extends GenericApiService and overrides the query preparation hooks
 * to transparently add tenant filtering to all database operations.
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
     * Override the query preparation hook to add tenant filtering
     */
    override prepareQuery(
        userContext: IUserContext,
        queryOptions: IQueryOptions,
        operations: Operation[],
    ): { queryOptions: IQueryOptions; operations: Operation[] } {
        if (
            !config?.app?.isMultiTenant ||
            userContext?.user?._id === getSystemUserId()
        ) {
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

        // Apply tenant filtering to the query object
        queryOptions = this.tenantDecorator.applyTenantToQuery(
            userContext,
            queryOptions,
            this.pluralResourceName,
        );
        return { queryOptions, operations };
    }

    /**
     * Override the individual entity preparation hook to add tenant ID
     * This will be called for both create and update operations
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

        // First call the base class implementation to handle standard entity preparation
        const preparedEntity = await super.preProcessEntity(
            userContext,
            entity,
            isCreate,
            allowId,
        );

        // Any new item should be created in the user's organization unless it's a system-initiated action or a meta-org admin
        if (isCreate && !isSystemUser(userContext) && !isMetaOrgAdmin(userContext)) {
            preparedEntity._orgId = userContext.user._orgId;
        }

        // The meta-org admin can create items in any organization, but still default to the user's organization. 
        if (isCreate && isMetaOrgAdmin(userContext)) {
            preparedEntity._orgId = preparedEntity._orgId ?? userContext.user._orgId;
        }

        return preparedEntity;
    }
}

import type { IEntity, IModelSpec, IQueryOptions, IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { getSystemUserId } from '@loomcore/common/validation';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError } from '../errors/index.js';
import { ServerError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import { GenericQueryService } from './generic-query-service/generic-query.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates GenericQueryService with multi-tenancy behavior.
 * This implementation extends GenericQueryService and overrides methods to pass
 * explicit orgId for tenant isolation in database operations.
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
     * Get the tenant orgId for database operations.
     * Returns undefined for single-tenant mode, system users, or meta org admins (unscoped access).
     * Throws BadRequestError if multi-tenant and no valid orgId is available.
     */
    private getTenantOrgId(userContext: IUserContext): AppIdType | undefined {
        if (!config?.app?.isMultiTenant) {
            return undefined;
        }
        if (isSystemUser(userContext)) {
            return undefined;
        }
        if (isMetaOrgAdmin(userContext)) {
            return undefined;
        }
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext with _orgId is required for multi-tenant operations',
            );
        }
        return userContext.user._orgId;
    }

    override prepareQuery(
        userContext: IUserContext | undefined,
        queryOptions: IQueryOptions,
        operations: Operation[],
    ): { queryOptions: IQueryOptions; operations: Operation[] } {
        const mergedOperations = [...this.defaultOperations, ...operations];

        if (
            !config?.app?.isMultiTenant ||
            userContext?.user?._id === getSystemUserId()
        ) {
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

    override async getAll(userContext: IUserContext): Promise<T[]> {
        const { operations } = this.prepareQuery(userContext, {}, []);
        const orgId = this.getTenantOrgId(userContext);

        const entities = await this.database.getAll<T>(operations, this.rootTableName, orgId);

        return entities.map(entity => {
            const dbPostProcessed = this.database.postProcessEntity(entity, this.modelSpec.fullSchema);
            return this.postProcessEntity(userContext, dbPostProcessed);
        });
    }

    override async getCount(userContext: IUserContext): Promise<number> {
        const orgId = this.getTenantOrgId(userContext);
        return this.database.getCount(this.rootTableName, orgId);
    }
}

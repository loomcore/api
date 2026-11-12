import type { IEntity, IModelSpec, IQueryOptions, IUserContext } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError, ServerError } from '../errors/index.js';
import { GenericQueryService } from './generic-query-service/generic-query.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates GenericQueryService with multi-tenancy behavior.
 *
 * getAll and getCount do not filter through query options, so those reads are isolated
 * by getTenantOrgId. get, getById, find, and other query-option reads pick up the tenant
 * filter from prepareQuery.
 *
 * This service can only be constructed while the app is multi-tenant. System users and
 * meta org admins stay unscoped. A tenant-scoped call without _orgId is rejected.
 */
export class MultiTenantQueryService<T extends IEntity> extends GenericQueryService<T> {
    private readonly tenantDecorator: TenantQueryDecorator;

    constructor(
        database: IDatabase,
        singularResourceName: string,
        pluralResourceName: string,
        modelSpec: IModelSpec,
        defaultOperations: Operation[] = [],
    ) {
        if (!config?.app?.isMultiTenant) {
            throw new ServerError(
                'MultiTenantQueryService can only be used in multi-tenant mode',
            );
        }
        super(database, singularResourceName, pluralResourceName, modelSpec, defaultOperations);
        this.tenantDecorator = new TenantQueryDecorator();
    }

    override getTenantOrgId(userContext: IUserContext): AppIdType | undefined {
        return this.tenantDecorator?.getTenantOrgId(userContext);
    }

    /**
     * Adds tenant filtering to queryOptions used by getById.
     */
    override prepareQuery(
        userContext: IUserContext,
        queryOptions: IQueryOptions,
        operations: Operation[],
    ): { queryOptions: IQueryOptions; operations: Operation[] } {
        if (!userContext?.user?._orgId) {
            throw new BadRequestError(
                'A valid userContext was not provided to MultiTenantQueryService.prepareQuery',
            );
        }

        let { queryOptions: mergedQueryOptions, operations: mergedOperations } = super.prepareQuery(userContext, queryOptions, operations);

        mergedQueryOptions = this.tenantDecorator.applyTenantToQuery(
            userContext,
            mergedQueryOptions,
            this.pluralResourceName,
        );
        return { queryOptions: mergedQueryOptions, operations: mergedOperations };
    }
}

import type {
    IEntity,
    IModelSpec,
    IQueryOptions,
    IUserContext,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { getSystemUserId } from '@loomcore/common/validation';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { DeleteResult } from '../databases/models/delete-result.js';
import type { Operation } from '../databases/operations/operation.js';
import { BadRequestError, IdNotFoundError } from '../errors/index.js';
import { ServerError } from '../errors/index.js';
import { isMetaOrgAdmin } from '../utils/auth/is-admin.util.js';
import { isSystemUser } from '../utils/auth/is-system-user.util.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';

/**
 * Decorates the GenericApiService with multi-tenancy behavior.
 * This implementation extends GenericApiService and overrides methods to pass
 * explicit orgId for tenant isolation in database operations.
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

    override async getAll(userContext: IUserContext): Promise<T[]> {
        const { operations } = this.prepareQuery(userContext, {}, []);
        const orgId = this.getTenantOrgId(userContext);

        const entities = await this.database.getAll<T>(operations, this.pluralResourceName, orgId);

        return entities.map((entity) => this.postProcessEntity(userContext, entity));
    }

    override async getCount(userContext: IUserContext): Promise<number> {
        const orgId = this.getTenantOrgId(userContext);
        return this.database.getCount(this.pluralResourceName, orgId);
    }

    override async fullUpdateById(userContext: IUserContext, id: AppIdType, entity: T): Promise<T> {
        const { operations, queryOptions } = this.prepareQuery(userContext, {}, []);
        const orgId = this.getTenantOrgId(userContext);

        const existingEntity = await this.database.getById<T>(operations, queryOptions, id, this.pluralResourceName);
        if (!existingEntity) {
            throw new IdNotFoundError();
        }

        const preparedEntity = await this.preProcessEntity(userContext, entity, false, true);

        preparedEntity._orgId = existingEntity._orgId;

        if ('_created' in existingEntity && '_createdBy' in existingEntity) {
            Object.assign(preparedEntity, {
                _created: existingEntity._created,
                _createdBy: existingEntity._createdBy,
            });
        }

        const rawUpdatedEntity = await this.database.fullUpdateById<T>(operations, id, preparedEntity, this.pluralResourceName, orgId);

        return this.postProcessEntity(userContext, rawUpdatedEntity);
    }

    override async partialUpdateById(userContext: IUserContext, id: AppIdType, entity: Partial<T>): Promise<T> {
        const { operations } = this.prepareQuery(userContext, {}, []);
        const orgId = this.getTenantOrgId(userContext);

        const preparedEntity = await this.preProcessEntity(userContext, entity, false, true);

        const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity, this.pluralResourceName, orgId);

        return this.postProcessEntity(userContext, rawUpdatedEntity);
    }

    override async partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: AppIdType, entity: Partial<T>): Promise<T> {
        const orgId = this.getTenantOrgId(userContext);

        const preparedEntity = this.database.preProcessEntity(entity, this.modelSpec.fullSchema);

        const rawUpdatedEntity = await this.database.partialUpdateById<T>([], id, preparedEntity, this.pluralResourceName, orgId);

        return this.database.postProcessEntity(rawUpdatedEntity, this.modelSpec.fullSchema);
    }

    override async deleteById(userContext: IUserContext, id: AppIdType): Promise<DeleteResult> {
        const orgId = this.getTenantOrgId(userContext);

        const deleteResult = await this.database.deleteById(id, this.pluralResourceName, orgId);

        if (deleteResult.count <= 0) {
            throw new IdNotFoundError();
        }

        return deleteResult;
    }
}

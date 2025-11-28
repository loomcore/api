import { IUserContext, IEntity, IQueryOptions, IModelSpec } from '@loomcore/common/models';

import { TenantQueryDecorator } from './tenant-query-decorator.js';
import { BadRequestError } from '../errors/bad-request.error.js';
import { config } from '../config/base-api-config.js';
import { Operation } from '../databases/operations/operation.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { IDatabase } from '../databases/models/index.js';

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
    modelSpec: IModelSpec
  ) {
    super(database, pluralResourceName, singularResourceName, modelSpec);
    if (config?.app?.isMultiTenant) {
      this.tenantDecorator = new TenantQueryDecorator();
    }
  }

  /**
   * Override the query preparation hook to add tenant filtering
   */
  override prepareQuery(userContext: IUserContext, queryOptions: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] } {
    if (!config?.app?.isMultiTenant) {
      return super.prepareQuery(userContext, queryOptions, operations);
    }
    if (!userContext || !userContext._orgId) {
      throw new BadRequestError('A valid userContext was not provided to MultiTenantApiService.prepareQuery');
    }
    
    // Apply tenant filtering to the query object
    const queryObject = this.tenantDecorator!.applyTenantToQuery(
      userContext, 
      queryOptions, 
      this.pluralResourceName
    );
    return { queryObject, operations };
  }


  /**
   * Override the individual entity preparation hook to add tenant ID
   * This will be called for both create and update operations
   */
  override async preprocessEntity(userContext: IUserContext, entity: Partial<T>, isCreate: boolean, allowId: boolean = false): Promise<Partial<T>> {
    if (!config?.app?.isMultiTenant) {
      return super.preprocessEntity(userContext, entity, isCreate, allowId);
    }
    if (!userContext || !userContext._orgId) {
      throw new BadRequestError('A valid userContext was not provided to MultiTenantApiService.prepareEntity');
    }
    
    // First call the base class implementation to handle standard entity preparation
    const preparedEntity = await super.preprocessEntity(userContext, entity, isCreate, allowId);
    
    // Then apply tenant ID
    const orgIdField = this.tenantDecorator!.getOrgIdField();
    (preparedEntity as any)[orgIdField] = userContext._orgId;
    
    return preparedEntity;
  }
} 
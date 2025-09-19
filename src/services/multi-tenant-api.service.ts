import { Db } from 'mongodb';
import { IUserContext, IEntity, IQueryOptions, IModelSpec } from '@loomcore/common/models';

import { GenericApiService } from './generic-api.service.js';
import { TenantQueryDecorator } from './tenant-query-decorator.js';
import { BadRequestError } from '../errors/bad-request.error.js';
import { config } from '../config/base-api-config.js';

/**
 * Decorates the GenericApiService with multi-tenancy behavior.
 * This implementation extends GenericApiService and overrides the query preparation hooks
 * to transparently add tenant filtering to all database operations.
 */
export class MultiTenantApiService<T extends IEntity> extends GenericApiService<T> {
  private tenantDecorator?: TenantQueryDecorator;
  
  constructor(
    db: Db, 
    pluralResourceName: string, 
    singularResourceName: string,
    modelSpec?: IModelSpec
  ) {
    super(db, pluralResourceName, singularResourceName, modelSpec);
    if (config?.app?.isMultiTenant) {
      this.tenantDecorator = new TenantQueryDecorator();
    }
  }

  /**
   * Override the query preparation hook to add tenant filtering
   */
  protected override prepareQuery(userContext: IUserContext, query: any): any {
    if (!config?.app?.isMultiTenant) {
      return super.prepareQuery(userContext, query);
    }
    if (!userContext || !userContext._orgId) {
      throw new BadRequestError('A valid userContext was not provided to MultiTenantApiService.prepareQuery');
    }
    
    // Apply tenant filtering to the query object
    return this.tenantDecorator!.applyTenantToQuery(
      userContext, 
      query, 
      this.pluralResourceName
    );
  }

  /**
   * Override the query options preparation hook to add tenant filtering
   */
  protected override prepareQueryOptions(userContext: IUserContext, queryOptions: IQueryOptions): IQueryOptions {
    if (!config?.app?.isMultiTenant) {
      return super.prepareQueryOptions(userContext, queryOptions);
    }
    if (!userContext || !userContext._orgId) {
      throw new BadRequestError('A valid userContext was not provided to MultiTenantApiService.prepareQueryOptions');
    }
    
    // Apply tenant filtering to the query options
    return this.tenantDecorator!.applyTenantToQueryOptions(
      userContext, 
      queryOptions, 
      this.pluralResourceName
    );
  }

  /**
   * Override the individual entity preparation hook to add tenant ID
   * This will be called for both create and update operations
   */
  protected override async prepareEntity(userContext: IUserContext, entity: T, isCreate: boolean, allowId: boolean = false): Promise<T | Partial<T>> {
    if (!config?.app?.isMultiTenant) {
      return super.prepareEntity(userContext, entity, isCreate, allowId);
    }
    if (!userContext || !userContext._orgId) {
      throw new BadRequestError('A valid userContext was not provided to MultiTenantApiService.prepareEntity');
    }
    
    // First call the base class implementation to handle standard entity preparation
    const preparedEntity = await super.prepareEntity(userContext, entity, isCreate, allowId);
    
    // Then apply tenant ID
    const orgIdField = this.tenantDecorator!.getOrgIdField();
    (preparedEntity as any)[orgIdField] = userContext._orgId;
    
    return preparedEntity;
  }
} 
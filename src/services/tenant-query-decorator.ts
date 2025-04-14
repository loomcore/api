import { IUserContext, QueryOptions, Filter, IEntity } from '../models/index.js';
import { ServerError } from '../errors/server.error.js';

export interface ITenantQueryOptions {
  /**
   * The field name used to store the organization ID in the database
   * @default '_orgId'
   */
  orgIdField?: string;
  
  /**
   * Optional list of collection names that should be excluded from multi-tenancy
   */
  excludedCollections?: string[]; // not using this really because I simply derive from GenericApiService for any service that doesn't need multi-tenancy
}

/**
 * Default options for the tenant query decorator
 */
export const DEFAULT_TENANT_OPTIONS: ITenantQueryOptions = {
  orgIdField: '_orgId',
  excludedCollections: []
};

/**
 * A utility class that adds multi-tenancy filtering to MongoDB queries
 */
export class TenantQueryDecorator {
  private options: ITenantQueryOptions;

  constructor(options: Partial<ITenantQueryOptions> = {}) {
    this.options = { ...DEFAULT_TENANT_OPTIONS, ...options };
  }

  /**
   * Decorates a MongoDB query object with tenant filtering
   * @param userContext The user context containing the org ID
   * @param queryObject The original query object
   * @param collectionName Collection name to check for exclusion
   * @returns The modified query object with tenant filtering added
   */
  applyTenantToQuery(userContext: IUserContext, queryObject: any, collectionName: string): any {
    let result = queryObject;
    
    const shouldApplyTenantFilter = 
      !this.options.excludedCollections?.includes(collectionName) &&
      userContext?._orgId;
    
    if (shouldApplyTenantFilter) {
      // Create a new query object that includes the tenant filter
      const orgIdField = this.options.orgIdField || '_orgId';
      result = { ...queryObject, [orgIdField]: userContext._orgId };
    } 
    else if (!userContext?._orgId) {
      // Don't throw for excluded collections
      if (!this.options.excludedCollections?.includes(collectionName)) {
        throw new ServerError('No _orgId found in userContext');
      }
    }
    
    return result;
  }

  /**
   * Applies tenant filtering to a QueryOptions object
   * @param userContext The user context containing the org ID
   * @param queryOptions The original query options
   * @param collectionName Collection name to check for exclusion
   * @returns A new QueryOptions object with tenant filtering added
   */
  applyTenantToQueryOptions(userContext: IUserContext, queryOptions: QueryOptions, collectionName: string): QueryOptions {
    let result = queryOptions;
    
    const shouldApplyTenantFilter = 
      !this.options.excludedCollections?.includes(collectionName) &&
      userContext?._orgId;
    
    if (shouldApplyTenantFilter) {
      // Clone the query options to avoid modifying the original
      const modifiedQueryOptions = new QueryOptions(queryOptions);
      
      // Add tenant filter to the filters object
      if (!modifiedQueryOptions.filters) {
        modifiedQueryOptions.filters = {};
      }
      
      // Add orgId filter
      const orgIdField = this.options.orgIdField || '_orgId';
      modifiedQueryOptions.filters[orgIdField] = { eq: userContext._orgId };
      
      result = modifiedQueryOptions;
    } 
    else if (!userContext?._orgId) {
      throw new ServerError('No _orgId found in userContext');
    }

    return result;
  }

  /**
   * Ensures an entity has the proper orgId set before being saved
   * @param userContext The user context containing the org ID
   * @param entity The entity to be saved
   * @param collectionName Collection name to check for exclusion
   * @returns The entity with tenant ID added
   */
  applyTenantToEntity<T extends IEntity>(userContext: IUserContext, entity: T, collectionName: string): T {
    let result = entity;
    
    const shouldApplyTenantFilter = 
      !this.options.excludedCollections?.includes(collectionName) &&
      userContext?._orgId;
    
    if (shouldApplyTenantFilter) {
      const orgIdField = this.options.orgIdField || '_orgId';
      
      // Create a new entity with the orgId property
      result = { 
        ...entity,
        [orgIdField]: userContext._orgId
      };
    } 
    else if (!userContext?._orgId) {
      // Don't throw for excluded collections
      if (!this.options.excludedCollections?.includes(collectionName)) {
        throw new ServerError('No _orgId found in userContext');
      }
    }
    
    return result;
  }

  /**
   * Returns the configured field name used for organization ID
   * @returns The organization ID field name
   */
  getOrgIdField(): string {
    return this.options.orgIdField || '_orgId';
  }
} 
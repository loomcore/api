import _ from 'lodash';
import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IQueryOptions, IPagedResult, IModelSpec, DefaultQueryOptions } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { IGenericApiService } from './generic-api-service.interface.js';
import { IDatabase } from '../models/database/database.interface.js';
import { Db, ObjectId } from 'mongodb';
import { Operation } from '../models/operations/operations.js';
import { MongoDBDatabase } from '../models/database/mongoDb/database.mongo.js';
import { Database } from '../models/database/database.js';
import { DeleteResult } from '../models/types/deleteResult.js';
import { stripSenderProvidedSystemProperties } from './utils/stripSenderProvidedSystemProperties.js';
import { auditForCreate } from './utils/auditForCreate.js';
import { auditForUpdate } from './utils/auditForUpdate.js';
import { BadRequestError, IdNotFoundError, NotFoundError } from '../errors/index.js';
import { convertStringsToObjectIds } from '../utils/mongo/convertStringsToObjectIds.js';
import { convertQueryObjectIds } from '../utils/mongo/convertQueryObjectIds.js';

export class GenericApiService2<T extends IEntity> implements IGenericApiService<T> {
  protected database: IDatabase;
  protected pluralResourceName: string;
  protected singularResourceName: string;
  protected modelSpec: IModelSpec;

  /**
   * @constructs GenericApiService2<T> where T extends IEntity
   * @param database Either a MongoDb Db or Postgres Sql database 
   * @param pluralResourceName This is camel-cased, plural (e.g. 'weatherAlerts') 
   * @param singularResourceName This is camel-cased, singular (e.g. 'weatherAlert') 
   * @param modelSpec The model spec 
   */
  constructor(
    database: Database,
    pluralResourceName: string,
    singularResourceName: string,
    modelSpec: IModelSpec
  ) {
    this.pluralResourceName = pluralResourceName;
    this.singularResourceName = singularResourceName;
    this.modelSpec = modelSpec;

    if (database instanceof Db) {
      this.database = new MongoDBDatabase(database, pluralResourceName);
    } else {
      throw Error('Sql Database not supported yet');
    }
  }

  async getAll(userContext: IUserContext): Promise<T[]> {
    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    const entities = await this.database.getAll<T>(operations);
    
    // Allow derived classes to transform the result
    return this.transformList(entities);
  }

  /**
   * This is a hook method.
   * It can be overridden by derived classes to provide certain operations before executing the database request.
   * @param userContext The user context for the operation
   * @param operations A list of operations to apply before executing the database request
   * @returns The potentially modified list of operations
   */
  protected prepareQuery(userContext: IUserContext | undefined, operations: Operation[]): Operation[] {
    return operations;
  }

  /**
   * Prepares a query object before executing database operations.
   * This is a hook method that can be overridden by derived classes to modify queries (e.g. add tenantId).
   * @param userContext The user context for the operation
   * @param queryObject The original query object
   * @returns The potentially modified query object
   */
  protected prepareQueryObject(userContext: IUserContext | undefined, queryObject: any): any {
    return queryObject;
  }
  
  transformList<T>(list: T[]): T[];
  transformList(list: (T | null)[]): (T | null)[] {
    if (!list) return [];

    // Map each item through transformSingle instead of using forEach
    return list.map(item => this.transformSingle(item));
  }

  /**
   * Transforms a single entity after retrieving from the database.
   * @param single Entity retrieved from database
   * @returns Transformed entity
   */
  transformSingle<T>(single: T): T;
  transformSingle(single: T | null): T | null {
    if (!single) return single;
    return this.database.transformSingle(single, this.modelSpec);
  }

  /**
   * Validates a document against the schema using TypeBox
   * @param doc The document to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if valid, or an array of ValueError objects if invalid
   */
  validate(doc: any, isPartial: boolean = false): ValueError[] | null {
    const validator = isPartial ? this.modelSpec.partialValidator : this.modelSpec.validator;
    
    // Use centralized validation function
    return entityUtils.validate(validator, doc);
  }

  /**
   * Validates multiple documents against the schema using TypeBox
   * @param docs Array of documents to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if all valid, or an array of ValueError objects if any are invalid
   */
  validateMany(docs: any[], isPartial: boolean = false): ValueError[] | null {
    const validator = isPartial ? this.modelSpec.partialValidator : this.modelSpec.validator;
    let allErrors: ValueError[] = [];

    for (const doc of docs) {
      const errors = entityUtils.validate(validator, doc);
      if (errors && errors.length > 0) {
        allErrors.push(...errors);
      }
    }
    
    // Return null if no errors found, otherwise return the accumulated errors
    return allErrors.length > 0 ? allErrors : null;
  }
  async prepareDataForDb(userContext: IUserContext, entity: T, isCreate?: boolean): Promise<T>;
  async prepareDataForDb(userContext: IUserContext, entity: Partial<T>, isCreate?: boolean): Promise<Partial<T>>;
  async prepareDataForDb(userContext: IUserContext, entity: T[], isCreate?: boolean): Promise<T[]>;
  async prepareDataForDb(userContext: IUserContext, entity: Partial<T>[], isCreate?: boolean): Promise<Partial<T>[]>;
  async prepareDataForDb(userContext: IUserContext, entity: T | Partial<T> | T[] | Partial<T>[], isCreate: boolean = false): Promise<T | Partial<T> | T[] | Partial<T>[]> {
    if (Array.isArray(entity)) {
      // Handle array of entities
      return await Promise.all(entity.map(item => this.prepareEntity(userContext, item, isCreate)));
    } else {
      // Handle single entity
      return await this.prepareEntity(userContext, entity, isCreate);
    } 
  }

  async prepareDataForBatchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<Partial<T>[]> {
    return Promise.all(entities.map(item => this.prepareEntity(userContext, item, false, true)));
  }

  /**
   * Prepares a single entity before database operations.
   * This contains the core logic for entity preparation that's applied to each entity.
   * @param userContext The user context for the operation
   * @param entity The original entity object
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @param allowId Whether to allow the _id property to be supplied by the caller
   * @returns The potentially modified entity
   */
  protected async prepareEntity(userContext: IUserContext, entity: T | Partial<T>, isCreate: boolean, allowId: boolean = false): Promise<T | Partial<T>> {
    // Clone the entity to avoid modifying the original
    let preparedEntity = _.clone(entity);

    // Strip out any system properties sent by the client
    stripSenderProvidedSystemProperties(userContext, preparedEntity, allowId);

    // Apply appropriate auditing based on operation type if the entity is auditable
    if (this.modelSpec.isAuditable) {
      if (isCreate) {
        auditForCreate(userContext, preparedEntity);
      } else {
        auditForUpdate(userContext, preparedEntity);
      }
    }

    // Require a modelSpec for conversion - without a schema we can't convert
    if (!this.modelSpec.fullSchema) {
      throw new BadRequestError(`Cannot prepare entity: No model specification with schema provided for ${this.pluralResourceName}`);
    }

    // Convert string IDs to ObjectIds based on schema
    preparedEntity = convertStringsToObjectIds(preparedEntity, this.modelSpec.fullSchema);

    return preparedEntity;
  }

  async get(userContext: IUserContext, queryOptions: IQueryOptions = { ...DefaultQueryOptions }): Promise<IPagedResult<T>> {
    // Prepare query options (allow subclasses to modify)
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Get paged result from database
    const pagedResult = await this.database.get<T>(operations, preparedOptions, this.modelSpec);

    // Transform the entities in the result
    const transformedEntities = this.transformList(pagedResult.entities || []);

    // Return paged result with transformed entities
    return {
      ...pagedResult,
      entities: transformedEntities
    };
  }

  /**
   * Prepare query options before using them. Subclasses can override this to apply tenant filters, etc.
   * @param userContext The user context
   * @param queryOptions The original query options
   * @returns The prepared query options
   */
  protected prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions {
    return queryOptions;
  }

  async getById(userContext: IUserContext, id: string): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Get entity from database
    const entity = await this.database.getById<T>(operations, id);

    if (!entity) {
      throw new IdNotFoundError();
    }

    // Transform and return the entity
    return this.transformSingle(entity);
  }
  async getCount(userContext: IUserContext): Promise<number> {
    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Get count from database
    return await this.database.getCount(operations);
  }

  async create(userContext: IUserContext, preparedEntity: T | Partial<T>): Promise<T | null> {
    let createdEntity = null;
    const entity = await this.onBeforeCreate(userContext, preparedEntity);
    const insertResult = await this.database.create(entity);
    
    if (insertResult.insertedId) {
      createdEntity = this.transformSingle(insertResult.entity);
    }
    
    if (createdEntity) {
      await this.onAfterCreate(userContext, createdEntity);
    }
    
    return createdEntity;
  }
  
  async createMany(userContext: IUserContext, entities: T[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (entities.length) {
      // Call onBeforeCreate once with the array of entities
      const preparedEntities = await this.onBeforeCreate(userContext, entities);
      
      // Insert all prepared entities
      const insertResult = await this.database.createMany(preparedEntities);

      if (insertResult.insertedIds) {
        // Transform all entities to have friendly IDs
        createdEntities = this.transformList(insertResult.entities);
      }

      // Call onAfterCreate once with all created entities
      if (createdEntities.length > 0) {
        await this.onAfterCreate(userContext, createdEntities);
      }
    }

    return createdEntities;
  }
  
  async batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    if (!entities || entities.length === 0) {
      return [];
    }
    
    // This is a bulk operation, so we call onBeforeUpdate once with the array
    const onBeforeResult = await this.onBeforeUpdate(userContext, entities);
    // Ensure we have an array (onBeforeUpdate can return E | E[], but for batchUpdate it should be an array)
    // When passing an array to onBeforeUpdate, it should return an array
    const entitiesAfterBefore: Partial<T>[] = Array.isArray(onBeforeResult) 
      ? (onBeforeResult as Partial<T>[])
      : [onBeforeResult as Partial<T>];

    // Prepare entities for database (convert string IDs to ObjectIds, apply audit fields, etc.)
    const preparedEntities = await this.prepareDataForBatchUpdate(userContext, entitiesAfterBefore);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform batch update through database
    const rawUpdatedEntities = await this.database.batchUpdate(preparedEntities, operations);
    
    // Transform the entities
    const updatedEntities = this.transformList(rawUpdatedEntities);
    
    // Call onAfterUpdate with all updated entities
    if (updatedEntities.length > 0) {
      await this.onAfterUpdate(userContext, updatedEntities);
    }

    return updatedEntities;
  }
  async fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, updates using the supplied entity, then retrieves the entity again. We could avoid the final
    //  fetch if we manually crafted the returned entity, but that seems presumptuous, especially
    //  as the update process gets more complex. PREFER using partialUpdateById.
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Get existing entity to preserve audit properties
    const existingEntity = await this.database.getById<T>(operations, id);
    if (!existingEntity) {
      throw new IdNotFoundError();
    }

    // Preserve system properties that should not be updated
    const auditProperties = {
      _created: (existingEntity as any)._created,
      _createdBy: (existingEntity as any)._createdBy,
    };

    // Call onBeforeUpdate once with the entity
    const entityAfterBefore = await this.onBeforeUpdate(userContext, entity);

    // Prepare the entity for database (convert string IDs to ObjectIds, etc.)
    // This will strip system properties, so we need to merge audit properties after
    const preparedEntity = await this.prepareDataForDb(userContext, entityAfterBefore as T, false);

    // Merge audit properties back into the prepared entity (after preparation to avoid stripping)
    Object.assign(preparedEntity, auditProperties);

    // Perform full update through database
    const rawUpdatedEntity = await this.database.fullUpdateById<T>(operations, id, preparedEntity);

    // Transform the entity
    const updatedEntity = this.transformSingle(rawUpdatedEntity);

    // Call onAfterUpdate with the updated entity
    await this.onAfterUpdate(userContext, updatedEntity);

    return updatedEntity;
  }
  async partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Call onBeforeUpdate once with the entity
    const entityAfterBefore = await this.onBeforeUpdate(userContext, entity);

    // Prepare the entity for database (convert string IDs to ObjectIds, apply audit fields, etc.)
    const preparedEntity = await this.prepareDataForDb(userContext, entityAfterBefore as Partial<T>, false);

    // Perform partial update through database
    const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity);

    // Transform the entity
    const updatedEntity = this.transformSingle(rawUpdatedEntity);

    // Call onAfterUpdate with the updated entity
    await this.onAfterUpdate(userContext, updatedEntity);

    return updatedEntity;
  }
  async partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, entity: T): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Prepare the entity for database (convert string IDs to ObjectIds, apply audit fields, etc.)
    // Note: This method does NOT call onBeforeUpdate or onAfterUpdate hooks
    const preparedEntity = await this.prepareDataForDb(userContext, entity as Partial<T>, false);

    // Perform partial update through database
    const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity);

    // Transform the entity
    return this.transformSingle(rawUpdatedEntity);
  }
  async update(userContext: IUserContext, queryObject: any, entity: Partial<T>): Promise<T[]> {
    // Call onBeforeUpdate once with the entity
    const entityAfterBefore = await this.onBeforeUpdate(userContext, entity);

    // Prepare the entity for database (convert string IDs to ObjectIds, apply audit fields, etc.)
    const preparedEntity = await this.prepareDataForDb(userContext, entityAfterBefore as Partial<T>, false);

    // Prepare the query object (allow subclasses to modify, e.g. add tenant filtering)
    const preparedQuery = this.prepareQueryObject(userContext, queryObject);

    // Convert string IDs in query object to ObjectIds if needed
    // This is a simplified conversion - for complex queries, this might need enhancement
    const convertedQuery = convertQueryObjectIds(preparedQuery);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform update through database
    const rawUpdatedEntities = await this.database.update<T>(convertedQuery, preparedEntity, operations);

    // Transform the entities
    const updatedEntities = this.transformList(rawUpdatedEntities);

    // Call onAfterUpdate with all updated entities
    if (updatedEntities.length > 0) {
      await this.onAfterUpdate(userContext, updatedEntities);
    }

    return updatedEntities;
  }

  async deleteById(userContext: IUserContext, id: string): Promise<DeleteResult> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Prepare query object with ObjectId conversion
    const baseQuery = { _id: new ObjectId(id) };
    const preparedQuery = this.prepareQueryObject(userContext, baseQuery);

    // Call onBeforeDelete hook
    await this.onBeforeDelete(userContext, preparedQuery);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform delete through database
    const deleteResult = await this.database.deleteById(operations, id);

    // Check if entity was found and deleted
    if (deleteResult.deletedCount <= 0) {
      throw new IdNotFoundError();
    }

    // Call onAfterDelete hook
    await this.onAfterDelete(userContext, preparedQuery);

    return new DeleteResult(
      deleteResult.acknowledged,
      deleteResult.deletedCount
    );
  }
  async deleteMany(userContext: IUserContext, queryObject: any): Promise<DeleteResult> {
    // Prepare the query object (allow subclasses to modify, e.g. add tenant filtering)
    const preparedQuery = this.prepareQueryObject(userContext, queryObject);

    // Convert string IDs in query object to ObjectIds if needed
    const convertedQuery = convertQueryObjectIds(preparedQuery);

    // Call onBeforeDelete hook
    await this.onBeforeDelete(userContext, convertedQuery);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform deleteMany through database
    const deleteResult = await this.database.deleteMany(convertedQuery, operations);

    // Call onAfterDelete hook
    await this.onAfterDelete(userContext, convertedQuery);

    return new DeleteResult(
      deleteResult.acknowledged,
      deleteResult.deletedCount
    );
  }
  async find(userContext: IUserContext, mongoQueryObject: any, options?: any): Promise<T[]> {
    // Prepare the query object (allow subclasses to modify, e.g. add tenant filtering)
    const preparedQuery = this.prepareQueryObject(userContext, mongoQueryObject);

    // Convert string IDs in query object to ObjectIds if needed
    const convertedQuery = convertQueryObjectIds(preparedQuery);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform find through database
    const rawEntities = await this.database.find<T>(convertedQuery, operations, options);

    // Transform the entities
    return this.transformList(rawEntities);
  }
  async findOne(userContext: IUserContext, mongoQueryObject: any, options?: any): Promise<T | null> {
    // Prepare the query object (allow subclasses to modify, e.g. add tenant filtering)
    const preparedQuery = this.prepareQueryObject(userContext, mongoQueryObject);

    // Convert string IDs in query object to ObjectIds if needed
    const convertedQuery = convertQueryObjectIds(preparedQuery);

    // Allow derived classes to provide operations to the request
    const operations = this.prepareQuery(userContext, []);

    // Perform findOne through database
    const rawEntity = await this.database.findOne<T>(convertedQuery, operations, options);

    // Transform the entity
    return this.transformSingle(rawEntity);
  }

  /**
   * Called once before creating entities in the database.
   * Hook for operations that should happen once before any entities are created.
   * Entity-specific modifications should be done in prepareEntity.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities to be created
   * @returns The prepared entity or entities
   */
  async onBeforeCreate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entities: E): Promise<E | E[]> {
    // Hook for derived classes to override
    return Promise.resolve(entities);
  }

  /**
   * Called once after entities have been created in the database.
   * Hook for operations that should happen once after creation.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities that were created
   * @returns The entities after post-processing
   */
  async onAfterCreate<E extends T | T[]>(userContext: IUserContext, entities: E): Promise<E | E[]> {
    return Promise.resolve(entities);
  }

  /**
   * Called once before updating entities in the database.
   * Hook for operations that should happen once before any entities are updated.
   * Entity-specific modifications should be done in prepareEntity.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities to be updated
   * @returns The prepared entity or entities
   */
  async onBeforeUpdate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entities: E): Promise<E | E[]> {
    // Hook for derived classes to override
    return Promise.resolve(entities);
  }

  /**
   * Called once after entities have been updated in the database.
   * Hook for operations that should happen once after update.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities that were updated
   * @returns The entities after post-processing
   */
  async onAfterUpdate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entities: E): Promise<E | E[]> {
    return Promise.resolve(entities);
  }

  /**
   * Called before deleting entities from the database.
   * Hook for operations that should happen before deletion.
   * @param userContext The user context for the operation
   * @param queryObject The query object used for deletion
   * @returns The query object after pre-processing
   */
  async onBeforeDelete(userContext: IUserContext, queryObject: any): Promise<any> {
    return Promise.resolve(queryObject);
  }

  /**
   * Called after deleting entities from the database.
   * Hook for operations that should happen after deletion.
   * @param userContext The user context for the operation
   * @param queryObject The query object used for deletion
   * @returns The query object after post-processing
   */
  async onAfterDelete(userContext: IUserContext, queryObject: any): Promise<any> {
    return Promise.resolve(queryObject);
  }
}

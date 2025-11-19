import _ from 'lodash';
import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IQueryOptions, IPagedResult, IModelSpec, DefaultQueryOptions } from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { IGenericApiService } from './generic-api-service.interface.js';
import { IDatabase } from '../../databases/database.interface.js';
import { Db } from 'mongodb';
import { Operation } from '../../databases/operations/operation.js';
import { MongoDBDatabase } from '../../databases/mongoDb/database.mongo.js';
import { Database } from '../../databases/database.js';
import { DeleteResult } from '../../databases/types/deleteResult.js';
import { stripSenderProvidedSystemProperties } from '../utils/stripSenderProvidedSystemProperties.js';
import { auditForCreate } from '../utils/auditForCreate.js';
import { auditForUpdate } from '../utils/auditForUpdate.js';
import { BadRequestError, IdNotFoundError, NotFoundError, ServerError } from '../../errors/index.js';

export class GenericApiService<T extends IEntity> implements IGenericApiService<T> {
  protected database: IDatabase;
  protected pluralResourceName: string;
  protected singularResourceName: string;
  protected modelSpec: IModelSpec;

  /**
   * @constructs GenericApiService<T> where T extends IEntity
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
    const { operations } = this.prepareQuery(userContext, {}, []);

    const entities = await this.database.getAll<T>(operations);
    
    return this.postprocessEntities(userContext, entities);
  }

  /**
   * This is a hook method that can be overridden by derived classes to modify queries (e.g. add tenantId).
   * It can be overridden by derived classes to provide certain operations before executing the database request.
   * @param userContext The user context for the operation
   * @param queryObject The original query object
   * @param operations A list of operations to apply before executing the database request
   * @returns The potentially modified query object and list of operations
   */
  prepareQuery(userContext: IUserContext | undefined, queryObject: IQueryOptions, operations: Operation[]): { queryObject: IQueryOptions, operations: Operation[] } {
    return { queryObject, operations };
  }
  
  /**
   * Validates a document against the schema using TypeBox
   * @param doc The document to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if valid, or an array of ValueError objects if invalid
   */
  validate(doc: any, isPartial: boolean = false): ValueError[] | null {
    const validator = isPartial ? this.modelSpec.partialValidator : this.modelSpec.validator;
    
    // Use common validation function
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

  /**
   * Prepares a single entity before database operations.
   * This contains the core logic for entity preparation that's applied to each entity.
   * @param userContext The user context for the operation
   * @param entity The original entity object
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @param allowId Whether to allow the _id property to be supplied by the caller
   * @returns The potentially modified entity
   */
  async preprocessEntity<U extends T | Partial<T>>(userContext: IUserContext, entity: U, isCreate: boolean, allowId: boolean = true): Promise<U> {
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

    // Require a modelSpec for decode and conversion - without a schema we can't do either
    if (!this.modelSpec?.fullSchema) {
      throw new ServerError(`Cannot prepare entity: No model specification with schema provided for ${this.pluralResourceName}`);
    }

    let cleanedEntity = preparedEntity;
    if (this.modelSpec) {
      /**
       * We use TypeBox decode on all models here in prepareEntity for all saves (create, update, etc), transforming 
       *  entities before they go into the database. The analagous encode is used in apiUtils.apiResponse<T> in the 
       *  controllers, transforming entities back into json format as the response of the controller endpoints.
       *  We keep the actual types (ObjectId, Date, etc) for use throughout the api, only transforming to their json 
       *  format when finally sending back to the client.
       * Note: All our models define props that are ObjectIds in Mongodb as strings. That's why we have a separate step
       *  (below) to convert those strings into ObjectIds. As far as TypeBox is concerned, those props are strings.
       *   This is necessary because shared model classes can't define anything as ObjectId - it would require 
       *   importing MongoDb, which we definitely don't want in a shared model library.
       */
      cleanedEntity = this.modelSpec.decode(preparedEntity);
    }

    preparedEntity = this.database.prepareData(cleanedEntity, this.modelSpec.fullSchema);

    return preparedEntity;
  }
  
  async preprocessEntities<U extends T | Partial<T>>(userContext: IUserContext, entities: U[], isCreate: boolean, allowId: boolean = true): Promise<U[]> {
    return await Promise.all(entities.map(entity => this.preprocessEntity(userContext, entity, isCreate, allowId)));
  }

  postprocessEntity(userContext: IUserContext, entity: T): T {
    return this.database.processData(entity, this.modelSpec.fullSchema);
  }

  postprocessEntities(userContext: IUserContext, entities: T[]): T[] {
    return entities.map(entity => this.postprocessEntity(userContext, entity));
  }

  async get(userContext: IUserContext, queryOptions: IQueryOptions = { ...DefaultQueryOptions }): Promise<IPagedResult<T>> {
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    const { operations } = this.prepareQuery(userContext, {}, []);

    const pagedResult = await this.database.get<T>(operations, preparedOptions, this.modelSpec);

    const transformedEntities = this.postprocessEntities(userContext, pagedResult.entities || []);

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

    const { operations } = this.prepareQuery(userContext, {}, []);

    const entity = await this.database.getById<T>(operations, id);

    if (!entity) {
      throw new IdNotFoundError();
    }

    return this.postprocessEntity(userContext, entity);
  }
  async getCount(userContext: IUserContext): Promise<number> {
    const { operations } = this.prepareQuery(userContext, {}, []);

    return await this.database.getCount(operations);
  }

  async create(userContext: IUserContext, entity: T | Partial<T>): Promise<T | null> {
    let createdEntity = null;

    const preparedEntity = await this.preprocessEntity(userContext, entity, true, true);
    const insertResult = await this.database.create(preparedEntity);
    
    if (insertResult.insertedId) {
      createdEntity = this.postprocessEntity(userContext, insertResult.entity);
    }
    
    return createdEntity;
  }
  
  async createMany(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (entities.length) {
      const preparedEntities = await this.preprocessEntities(userContext, entities, true, true);
      
      const insertResult = await this.database.createMany(preparedEntities);

      if (insertResult.insertedIds) {
        createdEntities = this.postprocessEntities(userContext, insertResult.entities);
      }
    }

    return createdEntities;
  }
  
  async batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    if (!entities || entities.length === 0) {
      return [];
    }
    
    const preparedEntities = await this.preprocessEntities(userContext, entities, false, true);

    const { operations } = this.prepareQuery(userContext, {}, []);

    const rawUpdatedEntities = await this.database.batchUpdate<T>(preparedEntities, operations);
    
    const updatedEntities = this.postprocessEntities(userContext, rawUpdatedEntities);

    return updatedEntities;
  }
  async fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, updates using the supplied entity, then retrieves the entity again. We could avoid the final
    //  fetch if we manually crafted the returned entity, but that seems presumptuous, especially
    //  as the update process gets more complex. PREFER using partialUpdateById.

    const { operations } = this.prepareQuery(userContext, {}, []);

    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

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

    const preparedEntity = await this.preprocessEntity(userContext, entity, false, true);

    // Merge audit properties back into the prepared entity (after preparation to avoid stripping)
    Object.assign(preparedEntity, auditProperties);

    const rawUpdatedEntity = await this.database.fullUpdateById<T>(operations, id, preparedEntity);

    const updatedEntity = this.postprocessEntity(userContext, rawUpdatedEntity);
    return updatedEntity;
  }
  async partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const { operations } = this.prepareQuery(userContext, {}, []);

    const preparedEntity = await this.preprocessEntity(userContext, entity, false, true);

    const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity);

    const updatedEntity = this.postprocessEntity(userContext, rawUpdatedEntity);

    return updatedEntity;
  }
  async partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, entity: T): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const { operations } = this.prepareQuery(userContext, {}, []);

    const preparedEntity = await this.preprocessEntity(userContext, entity, false, true);

    const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity);

    return this.postprocessEntity(userContext, rawUpdatedEntity);
  }
  async update(userContext: IUserContext, queryObject: any, entity: Partial<T>): Promise<T[]> {
    const { queryObject: preparedQuery, operations } = this.prepareQuery(userContext, queryObject, []);

    const preparedEntity = await this.preprocessEntity(userContext, entity, false, true);

    const rawUpdatedEntities = await this.database.update<T>(preparedQuery, preparedEntity, operations);

    const updatedEntities = this.postprocessEntities(userContext, rawUpdatedEntities);

    return updatedEntities;
  }

  async deleteById(userContext: IUserContext, id: string): Promise<DeleteResult> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const deleteResult = await this.database.deleteById(id);

    if (deleteResult.count <= 0) {
      throw new IdNotFoundError();
    }

    return deleteResult;
  }
  async deleteMany(userContext: IUserContext, queryObject: IQueryOptions): Promise<DeleteResult> {
    const { queryObject: preparedQuery, operations } = this.prepareQuery(userContext, queryObject, []);

    const deleteResult = await this.database.deleteMany(preparedQuery);

    return deleteResult;
  }
  async find(userContext: IUserContext, queryObject: IQueryOptions): Promise<T[]> {
    const { queryObject: preparedQuery, operations } = this.prepareQuery(userContext, queryObject, []);

    const rawEntities = await this.database.find<T>(preparedQuery);

    return this.postprocessEntities(userContext, rawEntities);
  }
  
  async findOne(userContext: IUserContext, queryObject: IQueryOptions): Promise<T | null> {
    const { queryObject: preparedQuery, operations } = this.prepareQuery(userContext, queryObject, []);

    const rawEntity = await this.database.findOne<T>(preparedQuery);

    return rawEntity ? this.postprocessEntity(userContext, rawEntity) : null;
  }
}

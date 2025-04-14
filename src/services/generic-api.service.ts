import { Db, Collection, ObjectId, DeleteResult, Document, FindOptions } from 'mongodb';
import moment from 'moment';
import _ from 'lodash';
import { BadRequestError, DuplicateKeyError, IdNotFoundError, NotFoundError, ServerError } from '../errors/index.js';
import { ValueError } from '@sinclair/typebox/errors';
import { Value } from '@sinclair/typebox/value';

import { IGenericApiService } from './generic-api-service.interface.js';
import { IAuditable, IUserContext, IEntity, QueryOptions, IPagedResult, IModelSpec } from '../models/index.js';
import { entityUtils, apiUtils, dbUtils } from '../utils/index.js';

export class GenericApiService<T extends IEntity> implements IGenericApiService<T> {
  protected db: Db;
  /**
   * This is camel-cased, plural (e.g. 'weatherAlerts')
   */
  protected pluralResourceName: string;
  /**
   * This is camel-cased, singular (e.g. 'weatherAlert')
   */
  protected singularResourceName: string;
  protected collection: Collection;
  
  // Store the model spec
  protected modelSpec?: IModelSpec;

  constructor(
    db: Db, 
    pluralResourceName: string, 
    singularResourceName: string,
    modelSpec?: IModelSpec
  ) {
    this.db = db;
    this.pluralResourceName = pluralResourceName;
    this.singularResourceName = singularResourceName;
    this.collection = db.collection(pluralResourceName);
    this.modelSpec = modelSpec;
  }

  /**
   * Validates a document against the schema using TypeBox
   * @param doc The document to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if valid, or an array of ValueError objects if invalid
   */
  validate(doc: any, isPartial: boolean = false): ValueError[] | null {
    // If no model spec was provided, consider it valid
    if (!this.modelSpec) {
      return null;
    }
    
    const validator = isPartial ? this.modelSpec.partialValidator : this.modelSpec.validator;
    
    // Use centralized validation function
    return entityUtils.validate(validator, doc);
  }

  /**
   * Returns additional pipeline stages to be included in aggregation queries.
   * Override this in derived classes to add custom joins or transformations.
   * @returns Array of MongoDB aggregation pipeline stages
   */
  protected getAdditionalPipelineStages(): any[] {
    return [];
  }

  /**
   * Creates a basic aggregation pipeline with optional query options.
   * Includes any additional stages from getAdditionalPipelineStages().
   */
  protected createAggregationPipeline(userContext: IUserContext, query: any, queryOptions?: QueryOptions): any[] {
    //{ $match: { categoryId: { $eq: "6773166188e8d5785a072f8a"} } },
    const match = { $match: query };
    const additionalStages = this.getAdditionalPipelineStages();

    let resultStages: any[] = [...additionalStages];

    if (queryOptions) {
      if (queryOptions.orderBy) {
        resultStages.push({
          $sort: {
            [queryOptions.orderBy]: queryOptions.sortDirection === 'asc' ? 1 : -1
          }
        });
      }

      if (queryOptions.page && queryOptions.pageSize) {
        resultStages.push({ $skip: (queryOptions.page - 1) * queryOptions.pageSize });
        resultStages.push({ $limit: queryOptions.pageSize });
      }
    }

    return [match, ...resultStages];
  }

  async getAll(userContext: IUserContext): Promise<T[]> {
    // Apply query preparation hook
    const query = this.prepareQuery(userContext, {});
    let entities: any[] = [];

    // Check if we have additional pipeline stages
    if (this.getAdditionalPipelineStages().length > 0) {
      const pipeline = this.createAggregationPipeline(userContext, query);
      entities = await this.collection.aggregate(pipeline).toArray();
    } else {
      // Use existing simple find approach if no additional stages
      const cursor = this.collection.find(query);
      entities = await cursor.toArray();
    }

    // Allow derived classes to transform the result
    return this.transformList(entities);
  }

  async get(userContext: IUserContext, queryOptions: QueryOptions = new QueryOptions()): Promise<IPagedResult<T>> {
    // Apply query options preparation hook
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    // Construct the query object
    // this is supposed to be the fastest way to perform a query AND get the total documents count in MongoDb
    const match = dbUtils.buildMongoMatchFromQueryOptions(preparedOptions);

    // Create results array with additional pipeline stages
    const additionalStages = this.getAdditionalPipelineStages();
    const results: any[] = [...additionalStages];

    if (preparedOptions.orderBy) {
      results.push({ $sort: { [preparedOptions.orderBy]: preparedOptions.sortDirection === 'asc' ? 1 : -1 } });
    }
    if (preparedOptions.page && preparedOptions.pageSize) {
      results.push({ $skip: (preparedOptions.page - 1) * preparedOptions.pageSize });
      results.push({ $limit: preparedOptions.pageSize });
    }

    const pipeline = [
      match,
      {
        $facet: {
          results: results,
          total: [
            { $count: 'total' }
          ]
        }
      }
    ];

    let pagedResult: IPagedResult<T> = apiUtils.getPagedResult<T>([], 0, preparedOptions);
    const cursor = this.collection.aggregate(pipeline);
    const aggregateResult = await cursor.next();
    
    if (aggregateResult) {
      let total = 0;
      if (aggregateResult.total && aggregateResult.total.length > 0) {
        // not sure how to get the aggregate pipeline above to return total as anything but an array
        total = aggregateResult.total[0].total;
      }
      const entities = this.transformList(aggregateResult.results);
      pagedResult = apiUtils.getPagedResult<T>(entities, total, preparedOptions);
    }
    return pagedResult;
  }

  async getById(userContext: IUserContext, id: string): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Apply query preparation hook
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);

    let entity = null;

    // Check if we have additional pipeline stages
    if (this.getAdditionalPipelineStages().length > 0) {
      const pipeline = this.createAggregationPipeline(userContext, query);
      entity = await this.collection.aggregate(pipeline).next();
    } 
    else {
      // Use existing simple findOne approach if no additional stages
      entity = await this.collection.findOne(query);
    }

    if (!entity) {
      throw new IdNotFoundError();
    }

    return this.transformSingle(entity);
  }

  async getCount(userContext: IUserContext): Promise<number> {
    // Apply query preparation hook
    const query = this.prepareQuery(userContext, {});

    const count = await this.collection.countDocuments(query);
    return count;
  }

  async create(userContext: IUserContext, entity: T | Partial<T>): Promise<T | null> {
    const validationErrors = this.validate(entity);
    entityUtils.handleValidationResult(validationErrors, 'GenericApiService.create');

    let createdEntity = null;
    try {
      const preparedEntity = await this.onBeforeCreate(userContext, entity);
      const insertResult = await this.collection.insertOne(preparedEntity);

      if (insertResult.insertedId) {
        // mongoDb mutates the entity passed into insertOne to have an _id property
        createdEntity = this.transformSingle(preparedEntity);
      }

      if (createdEntity) {
        await this.onAfterCreate(userContext, createdEntity);
      }
    }
    catch (err: any) {
      console.log(`error in GenericApiService.create - ${err.message}`);
      if (err.code === 11000) { // this is the MongoDb error code for duplicate key
        throw new DuplicateKeyError(`${this.singularResourceName} already exists`);
      }
      throw new BadRequestError(`Error creating ${this.singularResourceName}`);
    }

    return createdEntity;
  }

  /**
   * Creates multiple entities at once
   * @param userContext The user context for the operation
   * @param entities Array of entities to create
   * @returns The created entities with IDs
   */
  async createMany(userContext: IUserContext, entities: T[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (entities.length) {
      try {
        // Validate all entities first
        for (const entity of entities) {
          const validationErrors = this.validate(entity);
          entityUtils.handleValidationResult(validationErrors, 'GenericApiService.createMany');
        }

        // Call onBeforeCreate once with the array of entities
        const preparedEntities = await this.onBeforeCreate(userContext, entities); // onBeforeCreate calls preparePayload, which calls prepareEntity

        // Insert all prepared entities
        const insertResult = await this.collection.insertMany(preparedEntities);

        if (insertResult.insertedIds) {
          // Transform all entities to have friendly IDs
          createdEntities = this.transformList(preparedEntities);
        }

        // Call onAfterCreate once with all created entities
        await this.onAfterCreate(userContext, createdEntities);
      }
      catch (err: any) {
        console.log(`error in GenericApiService.createMany - ${err.message}`);
        if (err.code === 11000) {
          throw new DuplicateKeyError(`One or more ${this.pluralResourceName} already exist`);
        }
        throw new BadRequestError(`Error creating ${this.pluralResourceName}`);
      }
    }

    return createdEntities;
  }

  async fullUpdateById(userContext: IUserContext, id: string, entity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, updates using the supplied entity, then retrieves the entity again. We could avoid the final
    //  fetch if we manually crafted the returned entity, but that seems presumptuous, especially
    //  as the update process gets more complex. PREFER using partialUpdateById.
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const validationErrors = this.validate(entity);
    entityUtils.handleValidationResult(validationErrors, 'GenericApiService.fullUpdateById');

    // Apply query preparation hook
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);

    const existingEntity = await this.collection.findOne(query);
    if (!existingEntity) {
      throw new IdNotFoundError();
    }

    // Preserve system properties that should not be updated
    const auditProperties = {
      _created: existingEntity._created,
      _createdBy: existingEntity._createdBy,
    };

    // Call onBeforeUpdate once with the entity
    const clone = await this.onBeforeUpdate(userContext, entity); // onBeforeUpdate calls preparePayload, which calls prepareEntity

    // Merge audit properties back into the clone
    Object.assign(clone, auditProperties);

    const mongoUpdateResult = await this.collection.replaceOne(query, clone);

    if (mongoUpdateResult?.matchedCount <= 0) {
      throw new IdNotFoundError();
    }
    await this.onAfterUpdate(userContext, clone);

    // return the updated entity
    const updatedEntity = await this.collection.findOne(query);
    // allow derived classes to transform the result
    return this.transformSingle(updatedEntity);
  }

  async partialUpdateById(userContext: IUserContext, id: string, entity: Partial<T>): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const validationErrors = this.validate(entity, true);
    entityUtils.handleValidationResult(validationErrors, 'GenericApiService.partialUpdateById');

    const clone = await this.onBeforeUpdate(userContext, entity); // onBeforeUpdate calls preparePayload, which calls prepareEntity

    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);
    
    const updatedEntity = await this.collection.findOneAndUpdate(
      query,
      { $set: clone },
      { returnDocument: 'after' }
    );
    
    if (!updatedEntity) {
      throw new IdNotFoundError(); // todo: refactor to output the id
    }
    else {
      await this.onAfterUpdate(userContext, updatedEntity as T);
    }

    // allow derived classes to transform the result
    return this.transformSingle(updatedEntity);
  }

  async partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, entity: T): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const validationErrors = this.validate(entity, true);
    entityUtils.handleValidationResult(validationErrors, 'GenericApiService.partialUpdateByIdWithoutBeforeAndAfter');

    // Prepare the entity without going through onBeforeUpdate
    const preparedEntity = this.preparePayload(userContext, entity, false);

    // Apply query preparation hook
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);

    // $set causes mongo to only update the properties provided, without it, it will delete any properties not provided
    const modifyResult = await this.collection.findOneAndUpdate(
      query,
      { $set: preparedEntity },
      { returnDocument: 'after' }
    );

    let updatedEntity = null;
    if (modifyResult?.ok === 1) {
      updatedEntity = modifyResult.value;
    }
    else {
      if (!modifyResult?.value) {
        throw new IdNotFoundError(); // todo: refactor to output the id
      }
      else {
        throw new ServerError(`Error updating ${this.singularResourceName} - ${JSON.stringify(modifyResult.lastErrorObject)}`);
      }
    }
    // allow derived classes to transform the result
    return this.transformSingle(updatedEntity);
  }

  async update(userContext: IUserContext, queryObject: any, entity: Partial<T>): Promise<T[]> {
    const clone = await this.onBeforeUpdate(userContext, entity); // onBeforeUpdate calls preparePayload, which calls prepareEntity

    // Apply query preparation hook
    const query = this.prepareQuery(userContext, queryObject);

    // $set causes mongo to only update the properties provided, without it, it will delete any properties not provided
    const mongoUpdateResult = await this.collection.updateMany(query, { $set: clone });

    if (mongoUpdateResult?.matchedCount <= 0) {
      throw new NotFoundError('No records found matching update query');
    }
    await this.onAfterUpdate(userContext, clone);

    // return the updated entities
    const updatedEntities = await this.collection.find(query).toArray();
    // allow derived classes to transform the result
    return this.transformList(updatedEntities);
  }

  async deleteById(userContext: IUserContext, id: string): Promise<DeleteResult> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Apply query preparation hook
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);

    await this.onBeforeDelete(userContext, query);
    const deleteResult = await this.collection.deleteOne(query);

    // The deleteOne command returns the following:
    // { acknowledged: true, deletedCount: 1 }
    if (deleteResult.deletedCount <= 0) {
      throw new IdNotFoundError();
    }

    await this.onAfterDelete(userContext, query);

    return deleteResult; // ignore the result of onAfter and return what the deleteOne call returned
  }

  /**
   * Deletes multiple entities matching the specified query
   * @param userContext The user context for the operation
   * @param queryObject The query to identify entities to delete
   * @returns The MongoDB DeleteResult with details about the operation
   */
  async deleteMany(userContext: IUserContext, queryObject: any): Promise<DeleteResult> {
    const query = this.prepareQuery(userContext, queryObject);
    await this.onBeforeDelete(userContext, query);

    const deleteResult = await this.collection.deleteMany(query);

    await this.onAfterDelete(userContext, query);
    return deleteResult;
  }

  async find(userContext: IUserContext, mongoQueryObject: any, options?: FindOptions<Document> | undefined): Promise<T[]> {
    // Apply query preparation hook
    const query = this.prepareQuery(userContext, mongoQueryObject);

    const cursor = this.collection.find(query, options);
    const entities = await cursor.toArray();

    // allow derived classes to transform the result
    return this.transformList(entities);
  }

  async findOne(userContext: IUserContext, mongoQueryObject: any, options?: FindOptions<Document> | undefined): Promise<T> {
    const query = this.prepareQuery(userContext, mongoQueryObject);

    const entity = await this.collection.findOne(query, options);

    return this.transformSingle(entity);
  }

  auditForCreate(userContext: IUserContext, doc: any) {
    const now = moment().utc().toDate();
    const userId = userContext.user?._id?.toString() ?? 'system';
    doc._created = now;
    doc._createdBy = userId;
    doc._updated = now;
    doc._updatedBy = userId;
  }

  auditForUpdate(userContext: IUserContext, doc: any) {
    const userId = userContext.user?._id?.toString() ?? 'system';
    doc._updated = moment().utc().toDate();
    doc._updatedBy = userId;
  }

  /**
   * Called once before creating entities in the database.
   * Hook for operations that should happen once before any entities are created.
   * Entity-specific modifications should be done in prepareEntity.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities to be created
   * @returns The prepared entity or entities
   */
  onBeforeCreate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entities: E): Promise<E> {
    // Apply entity preparation with isCreate=true
    const preparedEntities = this.preparePayload(userContext, entities, true);
    return Promise.resolve(preparedEntities);
  }

  /**
   * Called once after entities have been created in the database.
   * Hook for operations that should happen once after creation.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities that were created
   * @returns The entities after post-processing
   */
  onAfterCreate<E extends T | T[]>(userContext: IUserContext | undefined, entities: E): Promise<E> {
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
  onBeforeUpdate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entities: E): Promise<E> {
    // Apply entity preparation with isCreate=false
    const preparedEntities = this.preparePayload(userContext, entities, false);
    return Promise.resolve(preparedEntities);
  }

  /**
   * Called once after entities have been updated in the database.
   * Hook for operations that should happen once after update.
   * @param userContext The user context for the operation
   * @param entities Entity or array of entities that were updated
   * @returns The entities after post-processing
   */
  onAfterUpdate<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext | undefined, entities: E): Promise<E> {
    return Promise.resolve(entities);
  }

  onBeforeDelete(userContext: IUserContext, queryObject: any) {
    return Promise.resolve(queryObject);
  }

  onAfterDelete(userContext: IUserContext, queryObject: any) {
    return Promise.resolve(queryObject);
  }

  transformList(list: any[]): T[] {
    if (!list) return [];

    // Map each item through transformSingle instead of using forEach
    return list.map(item => this.transformSingle(item));
  }

  transformSingle(single: any): T {
    return single;
  }

  private stripSenderProvidedSystemProperties(doc: any) {
    // we don't allow users to provide/overwrite any system properties
    if (doc._created) {
      delete doc._created;
    }
    if (doc._createdBy) {
      delete doc._createdBy;
    }
    if (doc._updated) {
      delete doc._updated;
    }
    if (doc._updatedBy) {
      delete doc._updatedBy;
    }
  }

  /**
   * Prepares an entity before database operations.
   * This is a hook method that can be overridden by derived classes to modify entities.
   * @param userContext The user context for the operation
   * @param entity The original entity object or array of entities
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @returns The potentially modified entity or array of entities
   */
  protected preparePayload<E extends T | T[] | Partial<T> | Partial<T>[]>(userContext: IUserContext, entity: E, isCreate: boolean = false): E {
    let result: E;

    if (Array.isArray(entity)) {
      // Handle array of entities
      result = entity.map(item => this.prepareEntity(userContext, item, isCreate)) as E;
    } else {
      // Handle single entity
      result = this.prepareEntity(userContext, entity as T, isCreate) as E;
    }

    return result;
  }

  /**
   * Prepares a single entity before database operations.
   * This contains the core logic for entity preparation that's applied to each entity.
   * @param userContext The user context for the operation
   * @param entity The original entity object
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @returns The potentially modified entity
   */
  protected prepareEntity(userContext: IUserContext, entity: T | Partial<T>, isCreate: boolean): T | Partial<T> {
    // Clone the entity to avoid modifying the original
    const preparedEntity = _.clone(entity);

    // Strip out any system properties sent by the client
    this.stripSenderProvidedSystemProperties(preparedEntity);

    // Apply appropriate auditing based on operation type if the entity is auditable
    if (this.modelSpec?.isAuditable) {
      if (isCreate) {
        this.auditForCreate(userContext, preparedEntity);
      } else {
        this.auditForUpdate(userContext, preparedEntity);
      }
    }

    // Not anymore - this is now handled via decode. Every property that is an ObjectId must be defined as such in the Schema
    // Convert any foreign keys to ObjectIds
    //entityUtils.convertForeignKeysToObjectIds(preparedEntity);

    // Use TypeBox to decode properties and clean properties not in the schema if a model spec is provided
    if (this.modelSpec) {
      // Use type assertion to handle potential unknown return type
      const cleanedEntity = this.modelSpec.decode(preparedEntity); // as T | Partial<T>
      return cleanedEntity;
    }

    return preparedEntity;
  }

  /**
   * Prepares a query object before executing database operations.
   * This is a hook method that can be overridden by derived classes to modify queries (e.g. add tenantId).
   * @param userContext The user context for the operation
   * @param query The original query object
   * @returns The potentially modified query object
   */
  protected prepareQuery(userContext: IUserContext | undefined, query: any): any {
    return query;
  }

  /**
   * Prepares query options before executing database operations.
   * This is a hook method that can be overridden by derived classes to modify query options (e.g. add tenantId).
   * @param userContext The user context for the operation
   * @param queryOptions The original query options
   * @returns The potentially modified query options
   */
  protected prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: QueryOptions): QueryOptions {
    return queryOptions;
  }
}

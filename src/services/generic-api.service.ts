import { Db, Collection, ObjectId, Document, FindOptions } from 'mongodb';
import moment from 'moment';
import _ from 'lodash';
import { ValueError } from '@sinclair/typebox/errors';
import { IUserContext, IEntity, IQueryOptions, IPagedResult, IModelSpec, DefaultQueryOptions } from '@loomcore/common/models';
import {entityUtils} from '@loomcore/common/utils';

import { IGenericApiService } from './generic-api-service.interface.js';
import { BadRequestError, DuplicateKeyError, IdNotFoundError, NotFoundError, ServerError } from '../errors/index.js';
import { apiUtils, buildMongoMatchFromQueryOptions, convertObjectIdsToStrings, convertStringsToObjectIds } from '../utils/index.js';
import { DeleteResult } from '../models/types/deleteResult.js';
import { auditForCreate } from './utils/auditForCreate.js';
import { auditForUpdate } from './utils/auditForUpdate.js';

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

  validateMany(docs: any[], isPartial: boolean = false): ValueError[] | null {
    // If no model spec was provided, consider it valid
    if (!this.modelSpec) {
      return null;
    }
    
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
  protected createAggregationPipeline(userContext: IUserContext, query: any, queryOptions?: IQueryOptions): any[] {
    //{ $match: { categoryId: { $eq: "6773166188e8d5785a072f8a"} } },
    const pipeline = [
		{ $match: query },
		{ $facet: {
			data: (() => {
				const resultStages = [];
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
				return resultStages;
			})(),
			count: [{ $count: 'total' }]
		}},
		{ $project: {
			data: 1,
			total: { $arrayElemAt: ['$count.total', 0] }
		}}
	];

	return pipeline;
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

  async get(userContext: IUserContext, queryOptions: IQueryOptions = { ...DefaultQueryOptions }): Promise<IPagedResult<T>> {
    // Prepare query options (allow subclasses to modify)
    const preparedOptions = this.prepareQueryOptions(userContext, queryOptions);

    // Build match conditions from query options
    const match = buildMongoMatchFromQueryOptions(preparedOptions, this.modelSpec);

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

    // Apply query preparation hook with ObjectId conversion
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);
    
    let entity = null;

    // Check if we have additional pipeline stages
    if (this.getAdditionalPipelineStages().length > 0) {
      const pipeline = [
        { $match: query },
        ...this.getAdditionalPipelineStages()
      ];
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

  async create(userContext: IUserContext, preparedEntity: T | Partial<T>): Promise<T | null> {
    let createdEntity = null;
    try {
      const entity = await this.onBeforeCreate(userContext, preparedEntity);
      // Need to use "as any" to bypass TypeScript's strict type checking
      // This is necessary because we're changing _id from string to ObjectId
      const insertResult = await this.collection.insertOne(entity as any);
      
      if (insertResult.insertedId) {
        // mongoDb mutates the entity passed into insertOne to have an _id property
        createdEntity = this.transformSingle(entity);
      }
      
      if (createdEntity) {
        await this.onAfterCreate(userContext, createdEntity);
      }
    }
    catch (err: any) {
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
  async createMany(userContext: IUserContext, preparedEntities: T[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (preparedEntities.length) {
      try {
        // Call onBeforeCreate once with the array of entities
        const entities = await this.onBeforeCreate(userContext, preparedEntities);

        // Insert all prepared entities - use "as any" to bypass TypeScript's strict checks
        const insertResult = await this.collection.insertMany(entities as any);

        if (insertResult.insertedIds) {
          // Transform all entities to have friendly IDs
          createdEntities = this.transformList(entities);
        }

        // Call onAfterCreate once with all created entities
        await this.onAfterCreate(userContext, createdEntities);
      }
      catch (err: any) {
        if (err.code === 11000) {
          throw new DuplicateKeyError(`One or more ${this.pluralResourceName} already exist`);
        }
        throw new BadRequestError(`Error creating ${this.pluralResourceName}`);
      }
    }

    return createdEntities;
  }

  /**
   * Updates multiple entities at once.
   * Each entity in the array must have a valid `_id`.
   * @param userContext The user context for the operation
   * @param entities Array of partial entities to update
   * @returns The updated entities with all their fields
   */
  async batchUpdate(userContext: IUserContext, preparedEntities: Partial<T>[]): Promise<T[]> {
    if (!preparedEntities || preparedEntities.length === 0) {
      return [];
    }
    
    // This is a bulk operation, so we call onBeforeUpdate once with the array
    const entities = await this.onBeforeUpdate(userContext, preparedEntities);

    const operations = [];
    const entityIds: ObjectId[] = [];

    for (const entity of entities) {
      // The entity should have been prepared by prepareDataForDb, which converts string _id to ObjectId
      const { _id, ...updateData } = entity as any;

      if (!_id || !(_id instanceof ObjectId)) {
        throw new BadRequestError('Each entity in a batch update must have a valid _id that has been converted to an ObjectId.');
      }
      
      entityIds.push(_id);

      operations.push({
        updateOne: {
          filter: { _id },
          update: { $set: updateData },
        },
      });
    }

    if (operations.length > 0) {
      await this.collection.bulkWrite(operations);
    }

    const query = this.prepareQuery(userContext, { _id: { $in: entityIds } });
    const rawUpdatedEntities = await this.collection.find(query).toArray();
    const updatedEntities = this.transformList(rawUpdatedEntities);
    
    // Call onAfterUpdate with all updated entities
    if (updatedEntities.length > 0) {
      await this.onAfterUpdate(userContext, updatedEntities);
    }

    return updatedEntities;
  }

  async fullUpdateById(userContext: IUserContext, id: string, preparedEntity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, updates using the supplied entity, then retrieves the entity again. We could avoid the final
    //  fetch if we manually crafted the returned entity, but that seems presumptuous, especially
    //  as the update process gets more complex. PREFER using partialUpdateById.
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Apply query preparation hook with ObjectId conversion
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
    const entity = await this.onBeforeUpdate(userContext, preparedEntity);

    // Merge audit properties back into the clone
    Object.assign(entity, auditProperties);

    const mongoUpdateResult = await this.collection.replaceOne(query, entity);

    if (mongoUpdateResult?.matchedCount <= 0) {
      throw new IdNotFoundError();
    }
    await this.onAfterUpdate(userContext, entity);

    // return the updated entity
    const updatedEntity = await this.collection.findOne(query);
    // allow derived classes to transform the result
    return this.transformSingle(updatedEntity);
  }

  async partialUpdateById(userContext: IUserContext, id: string, preparedEntity: Partial<T>): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    const entity = await this.onBeforeUpdate(userContext, preparedEntity);

    // Use ObjectId conversion for query
    const baseQuery = { _id: new ObjectId(id) };
    const query = this.prepareQuery(userContext, baseQuery);
    
    const updatedEntity = await this.collection.findOneAndUpdate(
      query,
      { $set: entity },
      { returnDocument: 'after' }
    );
    
    if (!updatedEntity) {
      throw new IdNotFoundError(); // todo: refactor to output the id
    }
    else {
      // Cast updatedEntity to unknown and then to T to bypass TypeScript type checking
      const typedEntity = updatedEntity as unknown as T;
      await this.onAfterUpdate(userContext, typedEntity);
    }

    // allow derived classes to transform the result
    return this.transformSingle(updatedEntity);
  }

  async partialUpdateByIdWithoutBeforeAndAfter(userContext: IUserContext, id: string, preparedEntity: T): Promise<T> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

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

  async update(userContext: IUserContext, queryObject: any, preparedEntity: Partial<T>): Promise<T[]> {
    const entity = await this.onBeforeUpdate(userContext, preparedEntity);

    // Apply query preparation hook
    const query = this.prepareQuery(userContext, queryObject);

    // $set causes mongo to only update the properties provided, without it, it will delete any properties not provided
    const mongoUpdateResult = await this.collection.updateMany(query, { $set: entity });

    if (mongoUpdateResult?.matchedCount <= 0) {
      throw new NotFoundError('No records found matching update query');
    }
    await this.onAfterUpdate(userContext, entity);

    // return the updated entities
    const updatedEntities = await this.collection.find(query).toArray();
    // allow derived classes to transform the result
    return this.transformList(updatedEntities);
  }

  async deleteById(userContext: IUserContext, id: string): Promise<DeleteResult> {
    if (!entityUtils.isValidObjectId(id)) {
      throw new BadRequestError('id is not a valid ObjectId');
    }

    // Apply query preparation hook with ObjectId conversion
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

    return new DeleteResult(
      deleteResult.acknowledged,
      deleteResult.deletedCount
    );
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
    return new DeleteResult(
      deleteResult.acknowledged,
      deleteResult.deletedCount
    );
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

  /**
   * Transforms a single entity after retrieving from the database.
   * This method converts ObjectIds from mongodb to strings - our models use strings, not ObjectIds
   * @param single Entity retrieved from database
   * @returns Transformed entity with string IDs
   */
  transformSingle(single: any): T {
    if (!single) return single;
  
    // Require a modelSpec for conversion - without a schema we can't properly convert
    if (!this.modelSpec?.fullSchema) {
      throw new ServerError(`Cannot transform entity: No model specification with schema provided for ${this.pluralResourceName}`);
    }
    
    // Only use schema-driven conversion
    const transformedEntity = convertObjectIdsToStrings<T>(single, this.modelSpec.fullSchema);
    return transformedEntity;
  }

  private stripSenderProvidedSystemProperties(userContext: IUserContext, doc: any, allowId: boolean = false) {
    // Allow system properties if this is a system-initiated action
    const isSystemUser = userContext.user?._id === 'system';
    if (isSystemUser) {
      return; // Don't strip any properties for system actions
    }

    // we don't allow users to provide/overwrite any system properties
    // todo: seriously consider removing the _orgId check once we handle user creation properly (when there is no more register endpoint)
    const propertiesToIgnore = ['_orgId'];

    // Add '_id' to ignore list if allowId is true
    if (allowId) {
      propertiesToIgnore.push('_id');
    }

    // Remove properties that start with '_' except those in the ignore list
    for (const key in doc) {
      if (Object.prototype.hasOwnProperty.call(doc, key) && key.startsWith('_') && !propertiesToIgnore.includes(key)) {
        delete doc[key];
      }
    }
  }

  /**
   * Prepares an entity before database operations - handles single and arrays of entities
   * This is a hook method that can be overridden by derived classes to modify entities.
   * @param userContext The user context for the operation
   * @param entity The original entity object or array of entities
   * @param isCreate Whether this is for a create operation (true) or update operation (false)
   * @returns The potentially modified entity or array of entities
   */
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

  /**
   * Prepares an array of entities for a batch update operation.
   * This method ensures that `_id` is preserved while other system properties are stripped.
   * @param userContext The user context for the operation
   * @param entities The array of partial entities to prepare
   * @returns The prepared entities
   */
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
    const preparedEntity = _.clone(entity);

    // Strip out any system properties sent by the client
    this.stripSenderProvidedSystemProperties(userContext, preparedEntity, allowId);

    // Apply appropriate auditing based on operation type if the entity is auditable
    if (this.modelSpec?.isAuditable) {
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

    // Only use schema-driven conversion
    return convertStringsToObjectIds(cleanedEntity, this.modelSpec.fullSchema);
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
   * Prepare query options before using them. Subclasses can override this to apply tenant filters, etc.
   * @param userContext The user context
   * @param queryOptions The original query options
   * @returns The prepared query options
   */
  protected prepareQueryOptions(userContext: IUserContext | undefined, queryOptions: IQueryOptions): IQueryOptions {
    return queryOptions;
  }
}

import {
  type IEntity,
  type IModelSpec,
  type IQueryOptions,
  type IUserContext,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { entityUtils } from '@loomcore/common/utils';
import type { ValueError } from '@sinclair/typebox/errors';
import _ from 'lodash';
import type { DeleteResult } from '../../databases/models/delete-result.js';
import type { IDatabase } from '../../databases/models/index.js';
import type { Operation } from '../../databases/operations/operation.js';
import { IdNotFoundError, ServerError } from '../../errors/index.js';
import { auditForCreate } from '../utils/audit-for-create.util.js';
import { auditForUpdate } from '../utils/audit-for-update.util.js';
import { stripSenderProvidedSystemProperties } from '../utils/strip-sender-provided-system-properties.util.js';
import type { IGenericApiService } from './generic-api-service.interface.js';
import { GenericQueryService } from '../generic-query-service/generic-query.service.js';

export class GenericApiService<T extends IEntity> extends GenericQueryService<T> implements IGenericApiService<T> {
  /**
   * @constructs GenericApiService<T> where T extends IEntity
   * @param database The database instance
   * @param singularResourceName This is camel-cased, singular (e.g. 'weatherAlert')
   * @param pluralResourceName This is camel-cased, plural (e.g. 'weatherAlerts')
   * @param modelSpec The model spec
   * @param defaultOperations Optional default operations (joins) to apply to all queries
   */
  constructor(
    database: IDatabase,
    singularResourceName: string,
    pluralResourceName: string,
    modelSpec: IModelSpec,
    defaultOperations: Operation[] = [],) {
    super(database, singularResourceName, pluralResourceName, modelSpec, defaultOperations);
  }

  async create(userContext: IUserContext, entity: Partial<T>): Promise<T | null> {
    let createdEntity: T | null = null;

    const preparedEntity = await this.preProcessEntity(userContext, entity, true, true);
    const insertResult = await this.database.create<T>(preparedEntity, this.pluralResourceName);

    if (insertResult.insertedId) {
      createdEntity = this.postProcessEntity(userContext, insertResult.entity);
    }

    return createdEntity;
  }

  async createMany(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (entities.length) {
      const preparedEntities = await Promise.all(
        entities.map((entity) =>
          this.preProcessEntity(userContext, entity, true, true),
        ),
      );
      const insertResult = await this.database.createMany<T>(preparedEntities, this.pluralResourceName);

      if (insertResult.insertedIds) {
        createdEntities = insertResult.entities.map((entity) =>
          this.postProcessEntity(userContext, entity),
        );
      }
    }

    return createdEntities;
  }

  async batchUpdate(userContext: IUserContext, entities: Partial<T>[]): Promise<T[]> {
    if (!entities || entities.length === 0) {
      return [];
    }

    const preparedEntities = await Promise.all(
      entities.map((entity) =>
        this.preProcessEntity(userContext, entity, false, true),
      ),
    );

    const { queryOptions, operations } = this.prepareQuery(userContext, {}, []);

    const rawUpdatedEntities = await this.database.batchUpdate<T>(preparedEntities, operations, queryOptions, this.pluralResourceName);

    const updatedEntities = rawUpdatedEntities.map((entity) =>
      this.postProcessEntity(userContext, entity),
    );

    return updatedEntities;
  }

  async fullUpdateById(userContext: IUserContext, id: AppIdType, entity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, then updates using the supplied entity.
    //  as the update process gets more complex. PREFER using partialUpdateById.

    const { operations, queryOptions } = this.prepareQuery(userContext, {}, []);

    // Get existing entity to preserve audit properties
    const existingEntity = await this.database.getById<T>(operations, queryOptions, id, this.pluralResourceName);
    if (!existingEntity) {
      throw new IdNotFoundError();
    }

    const preparedEntity = await this.preProcessEntity(userContext, entity, false, true);

    // Preserve system properties that should not be updated
    preparedEntity._orgId = existingEntity._orgId;

    if ('_created' in existingEntity && '_createdBy' in existingEntity) {
      // Merge audit properties back into the prepared entity (after preparation to avoid stripping)
      Object.assign(preparedEntity, {
        _created: existingEntity._created,
        _createdBy: existingEntity._createdBy,
      });
    }

    const rawUpdatedEntity = await this.database.fullUpdateById<T>(operations, id, preparedEntity, this.pluralResourceName, this.getTenantOrgId(userContext));

    const updatedEntity = this.postProcessEntity(userContext, rawUpdatedEntity);
    return updatedEntity;
  }

  async partialUpdateById(userContext: IUserContext, id: AppIdType, entity: Partial<T>): Promise<T> {
    const { operations } = this.prepareQuery(userContext, {}, []);

    const preparedEntity = await this.preProcessEntity(userContext, entity, false, true);

    const rawUpdatedEntity = await this.database.partialUpdateById<T>(operations, id, preparedEntity, this.pluralResourceName, this.getTenantOrgId(userContext));

    const updatedEntity = this.postProcessEntity(userContext, rawUpdatedEntity);

    return updatedEntity;
  }

  async partialUpdateByIdWithoutPreAndPostProcessing(userContext: IUserContext, id: AppIdType, entity: Partial<T>): Promise<T> {
    const preparedEntity = this.database.preProcessEntity(entity, this.modelSpec.fullSchema);

    const rawUpdatedEntity = await this.database.partialUpdateById<T>([], id, preparedEntity, this.pluralResourceName, this.getTenantOrgId(userContext));

    return this.database.postProcessEntity(rawUpdatedEntity, this.modelSpec.fullSchema);
  }

  async update(userContext: IUserContext, queryOptions: IQueryOptions, entity: Partial<T>): Promise<T[]> {
    const { queryOptions: preparedQuery, operations } = this.prepareQuery(userContext, queryOptions, []);

    const preparedEntity = await this.preProcessEntity(userContext, entity, false, true);

    const rawUpdatedEntities = await this.database.update<T>(preparedQuery, preparedEntity, operations, this.pluralResourceName);

    const updatedEntities = rawUpdatedEntities.map((entity) =>
      this.postProcessEntity(userContext, entity),
    );

    return updatedEntities;
  }

  async deleteById(userContext: IUserContext, id: AppIdType): Promise<DeleteResult> {
    const deleteResult = await this.database.deleteById(id, this.pluralResourceName, this.getTenantOrgId(userContext));

    if (deleteResult.count <= 0) {
      throw new IdNotFoundError();
    }

    return deleteResult;
  }

  async deleteMany(userContext: IUserContext, queryOptions: IQueryOptions): Promise<DeleteResult> {
    const { queryOptions: preparedQuery, operations } = this.prepareQuery(userContext, queryOptions, []);

    const deleteResult = await this.database.deleteMany(preparedQuery, this.pluralResourceName);

    return deleteResult;
  }

  /**
   * Validates a document against the schema using TypeBox
   * @param doc The document to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if valid, or an array of ValueError objects if invalid
   */
  validate(doc: any, isPartial: boolean = false): ValueError[] | null {
    // Use common validation function
    return entityUtils.validate(this.modelSpec, doc, isPartial);
  }

  /**
   * Validates multiple documents against the schema using TypeBox
   * @param docs Array of documents to validate
   * @param isPartial Whether to use the partial schema (for PATCH operations)
   * @returns null if all valid, or an array of ValueError objects if any are invalid
   */
  validateMany(docs: any[], isPartial: boolean = false): ValueError[] | null {
    let allErrors: ValueError[] = [];

    for (const doc of docs) {
      const errors = entityUtils.validate(this.modelSpec, doc, isPartial);
      if (errors && errors.length > 0) {
        allErrors.push(...errors);
      }
    }

    // Return null if no errors found, otherwise return the accumulated errors
    return allErrors.length > 0 ? allErrors : null;
  }

  /**
   * Hook for subclasses to supply a model spec for preprocessing a given entity.
   * Subclasses can return a per-entity spec (e.g. schema driven by stored data).
   * The default is the service's model spec.
   */
  protected async getModelSpecForPreProcessing(userContext: IUserContext, entity: Partial<T>): Promise<IModelSpec> {
    return this.modelSpec;
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
  async preProcessEntity(userContext: IUserContext, entity: Partial<T>, isCreate: boolean, allowId: boolean = true): Promise<Partial<T>> {
    // Clone the entity to avoid modifying the original
    let preparedEntity = _.clone(entity);

    // Strip out any system properties sent by the client
    stripSenderProvidedSystemProperties(userContext, preparedEntity, allowId);

    const modelSpec = await this.getModelSpecForPreProcessing(userContext, entity);

    // Apply appropriate auditing based on operation type if the entity is auditable
    if (modelSpec.isAuditable) {
      if (isCreate) {
        auditForCreate(userContext, preparedEntity);
      } else {
        auditForUpdate(userContext, preparedEntity);
      }
    }

    // Require a modelSpec for decode and conversion - without a schema we can't do either
    if (!modelSpec?.fullSchema) {
      throw new ServerError(
        `Cannot prepare entity: No model specification with schema provided for ${this.pluralResourceName}`,
      );
    }

    let cleanedEntity = preparedEntity;
    if (modelSpec) {
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
      cleanedEntity = modelSpec.decode(preparedEntity);
    }

    preparedEntity = this.database.preProcessEntity(cleanedEntity, modelSpec.fullSchema);

    return preparedEntity;
  }
}

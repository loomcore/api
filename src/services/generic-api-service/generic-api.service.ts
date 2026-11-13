import {
  type IEntity,
  type IModelSpec,
  type IQueryOptions,
} from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { entityUtils } from '@loomcore/common/utils';
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
import type { Filters } from '../filters.type.js';
import type { IRequestContext } from '../request-context.interface.js';

export class GenericApiService<T extends IEntity, TContext extends IRequestContext = IRequestContext>
  extends GenericQueryService<T, TContext>
  implements IGenericApiService<T, TContext>
{
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
    defaultOperations: Operation[] = [],
  ) {
    super(database, singularResourceName, pluralResourceName, modelSpec, defaultOperations);
  }

  /**
   * Validates a document against the given model spec. Synchronous because the spec is resolved first.
   * Override and call super.validate first for extra domain validation.
   */
  protected validate(spec: IModelSpec, entity: unknown, options: { partial: boolean }): void {
    const errors = entityUtils.validate(spec, entity, options.partial);
    entityUtils.handleValidationResult(errors, `${this.constructor.name}.validate`);
  }

  /**
   * Detects fields that Clean will strip (schema additionalProperties not true).
   * Runs before stripSenderProvidedSystemProperties so it reports fields unknown to fullSchema.
   */
  protected detectStrippedFields(context: TContext, spec: IModelSpec, entity: unknown): void {
    const cleaned = spec.clean(structuredClone(entity));
    if (!_.isEqual(cleaned, entity)) {
      // TODO: log to persistent logging the fact we had to strip
      this.onFieldsStripped(context, entity, cleaned);
    }
  }

  /** Extension point; the default does nothing beyond the TODO above. */
  protected onFieldsStripped(_context: TContext, _original: unknown, _cleaned: unknown): void {}

  async create(context: TContext, entity: Partial<T>): Promise<T | null> {
    let createdEntity: T | null = null;

    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: false });
    this.detectStrippedFields(context, spec, entity);
    const preparedEntity = await this.preProcessEntity(context, spec, entity, true);
    this.applyScopesToEntity(context, preparedEntity, true);

    const insertResult = await this.database.create<T>(this.pluralResourceName, preparedEntity);

    if (insertResult.insertedId) {
      createdEntity = this.postProcessEntity(context, spec, insertResult.entity);
    }

    return createdEntity;
  }

  async createMany(context: TContext, entities: Partial<T>[]): Promise<T[]> {
    let createdEntities: T[] = [];

    if (entities.length) {
      const spec = await this.resolveModelSpec(context);
      const preparedEntities = await Promise.all(
        entities.map(async (entity) => {
          this.validate(spec, entity, { partial: false });
          this.detectStrippedFields(context, spec, entity);
          const prepared = await this.preProcessEntity(context, spec, entity, true);
          this.applyScopesToEntity(context, prepared, true);
          return prepared;
        }),
      );
      const insertResult = await this.database.createMany<T>(this.pluralResourceName, preparedEntities);

      if (insertResult.insertedIds) {
        createdEntities = insertResult.entities.map((entity) =>
          this.postProcessEntity(context, spec, entity),
        );
      }
    }

    return createdEntities;
  }

  async batchUpdate(context: TContext, entities: Partial<T>[]): Promise<T[]> {
    if (!entities || entities.length === 0) {
      return [];
    }

    const spec = await this.resolveModelSpec(context);
    const preparedEntities = await Promise.all(
      entities.map(async (entity) => {
        this.validate(spec, entity, { partial: true });
        this.detectStrippedFields(context, spec, entity);
        const prepared = await this.preProcessEntity(context, spec, entity, false);
        this.applyScopesToEntity(context, prepared, false);
        return prepared;
      }),
    );

    const { queryOptions, operations } = this.buildQuery(context, {});

    const rawUpdatedEntities = await this.database.batchUpdate<T>(
      this.pluralResourceName,
      queryOptions.filters || {},
      preparedEntities,
      operations,
    );

    return rawUpdatedEntities.map((entity) => this.postProcessEntity(context, spec, entity));
  }

  async fullUpdateById(context: TContext, id: AppIdType, entity: T): Promise<T> {
    // this is not the most performant function - In order to protect system properties (like _created). it retrieves the
    //  existing entity, then updates using the supplied entity.
    //  as the update process gets more complex. PREFER using partialUpdateById.

    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: false });
    this.detectStrippedFields(context, spec, entity);

    const { operations, queryOptions } = this.buildQuery(context, {});
    const scopeFilters: Filters = { ...queryOptions.filters, _id: { eq: id } };

    // Get existing entity to preserve audit properties (scoped read — mismatch is 404)
    const existingEntity = await this.database.findOne<T>(this.pluralResourceName, scopeFilters, operations);
    if (!existingEntity) {
      throw new IdNotFoundError();
    }

    const preparedEntity = await this.preProcessEntity(context, spec, entity, false);
    this.applyScopesToEntity(context, preparedEntity, false);

    // Preserve system properties that should not be updated
    // (_orgId may already be stamped by TenantScope.applyToEntity for tenant users)
    if ('_created' in existingEntity && '_createdBy' in existingEntity) {
      // Merge audit properties back into the prepared entity (after preparation to avoid stripping)
      Object.assign(preparedEntity, {
        _created: existingEntity._created,
        _createdBy: existingEntity._createdBy,
      });
    }

    const rawUpdatedEntity = await this.database.replaceOne<T>(
      this.pluralResourceName,
      scopeFilters,
      preparedEntity,
      operations,
    );

    return this.postProcessEntity(context, spec, rawUpdatedEntity);
  }

  async partialUpdateById(context: TContext, id: AppIdType, entity: Partial<T>): Promise<T> {
    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: true });
    this.detectStrippedFields(context, spec, entity);
    const prepared = await this.preProcessEntity(context, spec, entity, false);
    this.applyScopesToEntity(context, prepared, false);

    const { operations } = this.buildQuery(context, {});
    const filters: Filters = { _id: { eq: id }, ...this.getScopeFilters(context) };

    const updated = await this.database.updateOne<T>(
      this.pluralResourceName,
      filters,
      prepared,
      operations,
    );

    return this.postProcessEntity(context, spec, updated);
  }

  async update(context: TContext, queryOptions: IQueryOptions, entity: Partial<T>): Promise<T[]> {
    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: true });
    this.detectStrippedFields(context, spec, entity);

    const { queryOptions: preparedQuery, operations } = this.buildQuery(context, queryOptions, []);
    const preparedEntity = await this.preProcessEntity(context, spec, entity, false);
    this.applyScopesToEntity(context, preparedEntity, false);

    const rawUpdatedEntities = await this.database.updateMany<T>(
      this.pluralResourceName,
      preparedQuery.filters || {},
      preparedEntity,
      operations,
    );

    return rawUpdatedEntities.map((e) => this.postProcessEntity(context, spec, e));
  }

  async deleteById(context: TContext, id: AppIdType): Promise<DeleteResult> {
    const filters: Filters = { _id: { eq: id }, ...this.getScopeFilters(context) };
    const deleteResult = await this.database.deleteOne(this.pluralResourceName, filters);

    if (deleteResult.count <= 0) {
      throw new IdNotFoundError();
    }

    return deleteResult;
  }

  async deleteMany(context: TContext, queryOptions: IQueryOptions): Promise<DeleteResult> {
    const { queryOptions: preparedQuery } = this.buildQuery(context, queryOptions, []);
    return this.database.deleteMany(this.pluralResourceName, preparedQuery.filters || {});
  }

  /**
   * Prepares a single entity before database operations.
   * Receives the resolved spec explicitly. _orgId stamping lives in TenantScope.applyToEntity.
   */
  async preProcessEntity(
    context: TContext,
    spec: IModelSpec,
    entity: Partial<T>,
    isCreate: boolean,
  ): Promise<Partial<T>> {
    // Clone the entity to avoid modifying the original
    let preparedEntity = _.clone(entity);

    // Strip out any system properties sent by the client (allowId is always true — every caller needs it)
    stripSenderProvidedSystemProperties(context.userContext, preparedEntity, true);

    // Apply appropriate auditing based on operation type if the entity is auditable
    if (spec.isAuditable) {
      if (isCreate) {
        auditForCreate(context.userContext, preparedEntity);
      } else {
        auditForUpdate(context.userContext, preparedEntity);
      }
    }

    // Require a modelSpec for decode and conversion - without a schema we can't do either
    if (!spec?.fullSchema) {
      throw new ServerError(
        `Cannot prepare entity: No model specification with schema provided for ${this.pluralResourceName}`,
      );
    }

    let cleanedEntity = preparedEntity;
    if (spec) {
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
      cleanedEntity = spec.decode(preparedEntity);
    }

    preparedEntity = this.database.preProcessEntity(cleanedEntity, spec.fullSchema);

    return preparedEntity;
  }
}

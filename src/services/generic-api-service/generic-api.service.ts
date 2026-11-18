import {
  type Filters,
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
   * Accepts typed values (e.g. Date objects) — TypeboxIsoDate Check accepts Date as well as ISO strings.
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
          return this.preProcessEntity(context, spec, entity, true);
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
        return this.preProcessEntity(context, spec, entity, false);
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
    // Full replace at the DB layer; Mongo/Postgres replaceOne never overwrite _id/_created/_createdBy.
    // Prefer partialUpdateById as the update path grows more complex.
    this.assertValidId(id);

    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: false });
    this.detectStrippedFields(context, spec, entity);

    const { operations, queryOptions } = this.buildQuery(context, {});
    const scopeFilters: Filters = { ...queryOptions.filters, _id: { eq: id } };

    const preparedEntity = await this.preProcessEntity(context, spec, entity, false);

    const rawUpdatedEntity = await this.database.replaceOne<T>(
      this.pluralResourceName,
      scopeFilters,
      preparedEntity,
      operations,
    );

    return this.postProcessEntity(context, spec, rawUpdatedEntity);
  }

  async partialUpdateById(context: TContext, id: AppIdType, entity: Partial<T>): Promise<T> {
    this.assertValidId(id);
    const spec = await this.resolveModelSpec(context);
    this.validate(spec, entity, { partial: true });
    this.detectStrippedFields(context, spec, entity);
    const prepared = await this.preProcessEntity(context, spec, entity, false);

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

    const rawUpdatedEntities = await this.database.updateMany<T>(
      this.pluralResourceName,
      preparedQuery.filters || {},
      preparedEntity,
      operations,
    );

    return rawUpdatedEntities.map((e) => this.postProcessEntity(context, spec, e));
  }

  async deleteById(context: TContext, id: AppIdType): Promise<DeleteResult> {
    this.assertValidId(id);
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
   * Single outer method for preparing an entity for a write. Do not override —
   * customize via prepareEntityForWrite instead. Fixed order:
   * applySystemWriteRules → prepareEntityForWrite → applyScopesToEntity → prepareEntityForStorage.
   */
  async preProcessEntity(
    context: TContext,
    spec: IModelSpec,
    entity: Partial<T>,
    isCreate: boolean,
  ): Promise<Partial<T>> {
    // a. System write rules — common to all databases and not optional
    let preparedEntity = this.applySystemWriteRules(context, spec, entity, isCreate);

    // b. Derived-class hook — default no-op; derived classes do NOT need to call super
    preparedEntity = await this.prepareEntityForWrite(context, spec, preparedEntity, isCreate);

    // c. Scoping lane — TenantScope stamps _orgId; feature scopes stamp their fields
    this.applyScopesToEntity(context, preparedEntity, isCreate);

    // d. DB storage prep — exactly once, last, right before the write
    if (!spec?.fullSchema) {
      throw new ServerError(
        `Cannot prepare entity: No model specification with schema provided for ${this.pluralResourceName}`,
      );
    }
    return this.database.prepareEntityForStorage(preparedEntity, spec);
  }

  /**
   * Common to all databases and not optional: strip client system props, audit when auditable,
   * and decode via the resolved spec. Create-audit survival on full replace is enforced by
   * IDatabase.replaceOne (Mongo and Postgres never overwrite _id/_created/_createdBy).
   */
  private applySystemWriteRules(
    context: TContext,
    spec: IModelSpec,
    entity: Partial<T>,
    isCreate: boolean,
  ): Partial<T> {
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

    /**
     * We use TypeBox decode on all models here in prepareEntity for all saves (create, update, etc), transforming
     *  entities before they go into the database. The analagous encode is used in apiUtils.apiResponse<T> in the
     *  controllers, transforming entities back into json format as the response of the controller endpoints.
     *  We keep the actual types (ObjectId, Date, etc) for use throughout the api, only transforming to their json
     *  format when finally sending back to the client.
     * Note: All our models define props that are ObjectIds in Mongodb as strings. That's why we have a separate step
     *  (prepareEntityForStorage) to convert those strings into ObjectIds. As far as TypeBox is concerned, those props are strings.
     *   This is necessary because shared model classes can't define anything as ObjectId - it would require
     *   importing MongoDb, which we definitely don't want in a shared model library.
     */
    preparedEntity = spec.decode(preparedEntity);

    return preparedEntity;
  }

  /**
   * Extension point for derived classes (email lowercase, password hashing, domain checks, etc.).
   * Default is a no-op. Derived classes do NOT need to call super.
   */
  protected async prepareEntityForWrite(
    _context: TContext,
    _spec: IModelSpec,
    entity: Partial<T>,
    _isCreate: boolean,
  ): Promise<Partial<T>> {
    return entity;
  }
}

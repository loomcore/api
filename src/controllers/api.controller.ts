import { Application, NextFunction, Request, Response } from 'express';
import { IEntity, IPagedResult, IModelSpec } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { BadRequestError, UnauthenticatedError } from '../errors/index.js';
import { Value } from '@sinclair/typebox/value';
import { getIdSchema } from '@loomcore/common/validation';
import type { TSchema } from '@sinclair/typebox';

import { IGenericApiService, type IRequestContext } from '../services/index.js';
import { apiUtils, authorizeMethod, createPublicSpec } from '../utils/index.js';
import { DeleteResult } from '../databases/models/delete-result.js';

export abstract class ApiController<T extends IEntity, TContext extends IRequestContext = IRequestContext> {
  protected app: Application;
  protected service: IGenericApiService<T, TContext>;
  protected slug: string;
  protected apiResourceName: string;
  protected modelSpec?: IModelSpec;
  protected publicSpec?: IModelSpec;
  /** True when the constructor received an explicit publicSpec (wins over createPublicSpec(resolved)). */
  private readonly explicitPublicSpec: boolean;
  private readonly publicSpecCache = new WeakMap<IModelSpec, IModelSpec>();
  protected idSchema: TSchema;

  /**
   * Creates a new API controller with standard REST endpoints for a specific entity type.
   * 
   * This constructor sets up the controller with the necessary dependencies and automatically maps
   * standard API routes for CRUD operations. By using the `publicSchema` parameter, derived controllers
   * can automatically filter sensitive data from API responses.
   * 
   * @param slug - The URL path segment for this resource (e.g., 'users' for '/api/users')
   * @param app - The Express application instance to register routes with
   * @param service - The service implementing business logic for this entity type (must implement IGenericApiService<T>))
   * @param resourceName - The singular name of the resource (used in error messages)
   * @param modelSpec - The TypeBox model specification containing schema and validation details
   * @param publicSpec - Optional model spec to filter sensitive fields from API responses (e.g., remove passwords)
   * 
   * @example
   * ```
   * // Create a users controller that automatically filters out password fields
   * class UsersController extends ApiController<IUser> {
   *   constructor(app: Application, db: Db) {
   *     const userService = new UserService(db);
   *     super('users', app, userService, 'user', UserSpec, PublicUserSchema);
   *   }
   * }
   * ```
   */
  protected constructor(
    slug: string,
    app: Application,
    service: IGenericApiService<T, TContext>,
    resourceName: string = '',
    modelSpec?: IModelSpec,
    publicSpec?: IModelSpec
  ) {
    this.slug = slug;
    this.app = app;
    this.service = service;
    this.apiResourceName = resourceName;
    this.modelSpec = modelSpec;
    this.idSchema = getIdSchema();
    this.explicitPublicSpec = publicSpec !== undefined;

    this.mapRoutes(app);

    if (modelSpec && !publicSpec) {
      this.publicSpec = createPublicSpec(modelSpec);
    } else {
      this.publicSpec = publicSpec;
    }
  }

  /**
   * Builds typed request context from Express. Throws if the request is unauthenticated.
   */
  protected createContext(req: Request): TContext {
    if (!req.userContext) {
      throw new UnauthenticatedError();
    }
    return { userContext: req.userContext } as TContext;
  }

  /**
   * Converts the `:id` route param to AppIdType via TypeBox.
   */
  protected parseId(req: Request): AppIdType {
    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestError('ID parameter is required');
    }

    try {
      return Value.Convert(this.idSchema, idParam) as AppIdType;
    } catch (error: any) {
      throw new BadRequestError(`Invalid ID format: ${error.message || error}`);
    }
  }

  /**
   * Memoized createPublicSpec(resolvedSpec). Used when the controller was not given an explicit publicSpec.
   */
  protected getPublicSpec(resolvedSpec: IModelSpec): IModelSpec {
    let cached = this.publicSpecCache.get(resolvedSpec);
    if (!cached) {
      cached = createPublicSpec(resolvedSpec);
      this.publicSpecCache.set(resolvedSpec, cached);
    }
    return cached;
  }

  /**
   * Resolves the model spec for this request and the public spec used for encoding.
   * Explicit constructor publicSpec wins; otherwise createPublicSpec(resolved) (memoized).
   */
  protected async getResponseSpecs(context: TContext): Promise<{ modelSpec: IModelSpec; publicSpec: IModelSpec }> {
    const modelSpec = await this.service.resolveModelSpec(context);
    const publicSpec = this.explicitPublicSpec ? this.publicSpec! : this.getPublicSpec(modelSpec);
    return { modelSpec, publicSpec };
  }

  /**
   * Resolves @Authorize metadata for a controller method and returns Express middleware.
   * Use from mapRoutes in this class or any derived controller:
   *
   *   app.get(`/api/${this.slug}/me`, this.authorize('getSelf'), this.getSelf.bind(this));
   *
   * Pass the method name so metadata can be read from the prototype — a bound function
   * is a distinct object and does not carry decorator metadata.
   *
   * Typed as `string` (not `keyof this`) so the same helper is valid in derived
   * `mapRoutes` methods. Polymorphic `this` makes `keyof this` unusable on a
   * base-class method: even `this.authorize('get')` fails to type-check.
   */
  protected authorize(method: string) {
    return authorizeMethod(this, method);
  }

  mapRoutes(app: Application) {
    // Map routes
    // have to bind "this" because when express calls the function we tell it to here, it won't have any context and "this" will be undefined in our functions
    app.get(`/api/${this.slug}`, this.authorize('get'), this.get.bind(this));
    app.get(`/api/${this.slug}/all`, this.authorize('getAll'), this.getAll.bind(this));
    app.get(`/api/${this.slug}/count`, this.authorize('getCount'), this.getCount.bind(this));
    app.get(`/api/${this.slug}/:id`, this.authorize('getById'), this.getById.bind(this));
    app.post(`/api/${this.slug}`, this.authorize('create'), this.create.bind(this));
    app.patch(`/api/${this.slug}/batch`, this.authorize('batchUpdate'), this.batchUpdate.bind(this));
    app.put(`/api/${this.slug}/:id`, this.authorize('fullUpdateById'), this.fullUpdateById.bind(this));
    app.patch(`/api/${this.slug}/:id`, this.authorize('partialUpdateById'), this.partialUpdateById.bind(this));
    app.delete(`/api/${this.slug}/:id`, this.authorize('deleteById'), this.deleteById.bind(this));
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const entities = await this.service.getAll(context);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T[]>(res, 200, { data: entities }, modelSpec, publicSpec);
  }

  async get(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);

    // Extract query options from request
    const queryOptions = apiUtils.getQueryOptionsFromRequest(req);

    // Get paged result from service
    const pagedResult = await this.service.get(context, queryOptions);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<IPagedResult<T>>(res, 200, { data: pagedResult }, modelSpec, publicSpec);
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const id = this.parseId(req);

    const entity = await this.service.getById(context, id);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T>(res, 200, { data: entity }, modelSpec, publicSpec);
  }

  async getCount(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const count = await this.service.getCount(context); // result is in the form { count: number }
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<number>(res, 200, { data: count }, modelSpec, publicSpec);
  }

  async create(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);

    const entity = await this.service.create(context, req.body);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T>(res, 201, { data: entity || undefined }, modelSpec, publicSpec);
  }

  async batchUpdate(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);

    const entities = req.body as Partial<T>[];

    if (!Array.isArray(entities)) {
      // Using apiUtils to send a standardized error response would be better if available
      throw new BadRequestError('Request body must be an array of entities.');
    }

    // Convert HTTP string IDs to AppIdType using TypeBox
    const convertedEntities = entities.map(entity => {
      if (entity._id !== undefined) {
        try {
          const convertedId = Value.Convert(this.idSchema, entity._id) as AppIdType;
          return { ...entity, _id: convertedId };
        } catch (error: any) {
          throw new BadRequestError(`Invalid ID format for entity: ${error.message || error}`);
        }
      }
      return entity;
    });

    const updatedEntities = await this.service.batchUpdate(context, convertedEntities);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T[]>(res, 200, { data: updatedEntities }, modelSpec, publicSpec);
  }

  async fullUpdateById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const id = this.parseId(req);

    const updateResult = await this.service.fullUpdateById(context, id, req.body);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T>(res, 200, { data: updateResult }, modelSpec, publicSpec);
  }

  async partialUpdateById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const id = this.parseId(req);

    const updateResult = await this.service.partialUpdateById(context, id, req.body);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<T>(res, 200, { data: updateResult }, modelSpec, publicSpec);
  }

  async deleteById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const context = this.createContext(req);
    const id = this.parseId(req);

    const deleteResult = await this.service.deleteById(context, id);
    const { modelSpec, publicSpec } = await this.getResponseSpecs(context);
    apiUtils.apiResponse<DeleteResult>(res, 200, { data: deleteResult }, modelSpec, publicSpec);
  }
}

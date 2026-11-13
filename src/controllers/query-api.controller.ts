import { Application, NextFunction, Request, Response } from 'express';
import { IEntity, IPagedResult, IModelSpec } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import { BadRequestError, UnauthenticatedError } from '../errors/index.js';
import { Value } from '@sinclair/typebox/value';
import { getIdSchema } from '@loomcore/common/validation';
import type { TSchema } from '@sinclair/typebox';

import { IGenericQueryService, type IRequestContext } from '../services/index.js';
import { apiUtils, authorizeMethod, createPublicSpec } from '../utils/index.js';

export abstract class QueryApiController<T extends IEntity, TContext extends IRequestContext = IRequestContext> {
  protected app: Application;
  protected service: IGenericQueryService<T, TContext>;
  protected slug: string;
  protected apiResourceName: string;
  protected modelSpec?: IModelSpec;
  protected publicSpec?: IModelSpec;
  /** True when the constructor received an explicit publicSpec (wins over createPublicSpec(resolved)). */
  private readonly explicitPublicSpec: boolean;
  private readonly publicSpecCache = new WeakMap<IModelSpec, IModelSpec>();
  protected idSchema: TSchema;

  /**
   * Creates a new API controller for complex query operations on a specific entity type.
   * 
   * This constructor sets up the controller with the necessary dependencies and automatically maps
   * standard API routes for query operations. By using the `publicSchema` parameter, derived controllers
   * can automatically filter sensitive data from API responses.
   * 
   * @param slug - The URL path segment for this resource (e.g., 'users' for '/api/users')
   * @param app - The Express application instance to register routes with
   * @param service - The service implementing business logic for this entity type (must implement IGenericQueryService<T>))
   * @param resourceName - The singular name of the resource (used in error messages)
   * @param modelSpec - The TypeBox model specification containing schema and validation details
   * @param publicSpec - Optional model spec to filter sensitive fields from API responses (e.g., remove passwords)
   * 
   * @example
   * ```
   * // Create a users controller that automatically filters out password fields
   * class UsersController extends QueryApiController<IUser> {
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
    service: IGenericQueryService<T, TContext>,
    resourceName: string = '',
    modelSpec?: IModelSpec,
    publicSpec?: IModelSpec
  ) {
    this.slug = slug;
    this.app = app;
    this.service = service;
    this.apiResourceName = resourceName;
    this.modelSpec = modelSpec;
    this.explicitPublicSpec = publicSpec !== undefined;
    this.publicSpec = publicSpec;
    this.idSchema = getIdSchema();

    this.mapRoutes(app);
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
   * Use from mapRoutes in this class or any derived controller. Pass the method name
   * (not a bound function) so decorator metadata can be read. Typed as `string`
   * so the same helper is valid in derived `mapRoutes` methods — polymorphic
   * `this` makes `keyof this` unusable on a base-class method.
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

}

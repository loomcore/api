import {Application, NextFunction, Request, Response} from 'express';
import {DeleteResult, UpdateResult} from 'mongodb';
import { TSchema } from '@sinclair/typebox';
import {IEntity, IPagedResult, IModelSpec, IUserContext} from '@loomcore/common/models';
import {entityUtils} from '@loomcore/common/utils';

import {IGenericApiService} from '../services/index.js';
import {isAuthenticated} from '../middleware/index.js';
import {apiUtils} from '../utils/index.js';

export abstract class ApiController<T extends IEntity> {
  protected app: Application;
  protected service: IGenericApiService<T>;
  protected slug: string;
	protected apiResourceName: string;
  protected modelSpec?: IModelSpec;
  protected publicSchema?: TSchema;

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
   * @param publicSchema - Optional schema to filter sensitive fields from API responses (e.g., remove passwords)
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
    service: IGenericApiService<T>, 
    resourceName: string = '',
    modelSpec?: IModelSpec,
    publicSchema?: TSchema
  ) {
	  this.slug = slug;
	  this.app = app;
    this.service = service;
		this.apiResourceName = resourceName;
    this.modelSpec = modelSpec;
    this.publicSchema = publicSchema;

    this.mapRoutes(app);
  }

  mapRoutes(app: Application) {
		// Map routes
    // have to bind "this" because when express calls the function we tell it to here, it won't have any context and "this" will be undefined in our functions
    app.get(`/api/${this.slug}`, isAuthenticated, this.get.bind(this));
	  app.get(`/api/${this.slug}/all`, isAuthenticated, this.getAll.bind(this));
	  app.get(`/api/${this.slug}/count`, isAuthenticated, this.getCount.bind(this));
	  app.get(`/api/${this.slug}/:id`, isAuthenticated, this.getById.bind(this));
	  app.post(`/api/${this.slug}`, isAuthenticated, this.create.bind(this));
	  app.put(`/api/${this.slug}/:id`, isAuthenticated, this.fullUpdateById.bind(this));
		app.patch(`/api/${this.slug}/:id`, isAuthenticated, this.partialUpdateById.bind(this));
    app.delete(`/api/${this.slug}/:id`, isAuthenticated, this.deleteById.bind(this));
    
    // all of the above, just without the isAuthenticated middleware
    // app.get(`/api/${this.slug}`, this.get.bind(this));
	  // app.get(`/api/${this.slug}/all`, this.getAll.bind(this));
	  // app.get(`/api/${this.slug}/count`, this.getCount.bind(this));
	  // app.get(`/api/${this.slug}/:id`, this.getById.bind(this));
	  // app.post(`/api/${this.slug}`, this.create.bind(this));
	  // app.put(`/api/${this.slug}/:id`, this.fullUpdateById.bind(this));
		// app.patch(`/api/${this.slug}/:id`, this.partialUpdateById.bind(this));
    // app.delete(`/api/${this.slug}/:id`, this.deleteById.bind(this));
  }

  /**
   * Validates a single entity using the service's validation logic
   * @param entity The entity to validate
   * @param isPartial Whether to use partial validation (for PATCH operations)
   */
  protected validate(entity: any, isPartial: boolean = false): void {
    const validationErrors = this.service.validate(entity, isPartial);
    entityUtils.handleValidationResult(validationErrors, `ApiController.validate for ${this.slug}`);
  }

  /**
   * Validates multiple entities using the service's validation logic
   * @param entities Array of entities to validate
   * @param isPartial Whether to use partial validation
   */
  protected validateMany(entities: any[], isPartial: boolean = false): void {
    const validationErrors = this.service.validateMany(entities, isPartial);
    entityUtils.handleValidationResult(validationErrors, `ApiController.validateMany for ${this.slug}`);
  }

  /**
   * Prepares data for database storage by calling the service's preparation logic
   * @param userContext The user context for the operation
   * @param entity The entity or array of entities to prepare
   * @param isCreate Whether this is for a create operation
   * @returns The prepared entity or entities
   */
  protected async prepareDataForDb(userContext: IUserContext, entity: T, isCreate?: boolean): Promise<T>;
  protected async prepareDataForDb(userContext: IUserContext, entity: Partial<T>, isCreate?: boolean): Promise<Partial<T>>;
  protected async prepareDataForDb(userContext: IUserContext, entity: T[], isCreate?: boolean): Promise<T[]>;
  protected async prepareDataForDb(userContext: IUserContext, entity: Partial<T>[], isCreate?: boolean): Promise<Partial<T>[]>;
  protected async prepareDataForDb(userContext: IUserContext, entity: T | Partial<T> | T[] | Partial<T>[], isCreate: boolean = false): Promise<T | Partial<T> | T[] | Partial<T>[]> {
    return await this.service.prepareDataForDb(userContext, entity as any, isCreate);
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const entities = await this.service.getAll(req.userContext!);
    apiUtils.apiResponse<T[]>(res, 200, {data: entities}, this.modelSpec, this.publicSchema);
  }

	async get(req: Request, res: Response, next: NextFunction) {
		res.set('Content-Type', 'application/json');
    
		// Extract query options from request
		const queryOptions = apiUtils.getQueryOptionsFromRequest(req);
    
    // Get paged result from service
		const pagedResult = await this.service.get(req.userContext!, queryOptions);
    // Prepare API response
		apiUtils.apiResponse<IPagedResult<T>>(res, 200, { data: pagedResult }, this.modelSpec, this.publicSchema);
	}

  async getById(req: Request, res: Response, next: NextFunction) {
    let id = req.params?.id;
    res.set('Content-Type', 'application/json');
    const entity = await this.service.getById(req.userContext!, id);
    apiUtils.apiResponse<T>(res, 200, {data: entity}, this.modelSpec, this.publicSchema);
  }

	async getCount(req: Request, res: Response, next: NextFunction) {
		res.set('Content-Type', 'application/json');
		const count = await this.service.getCount(req.userContext!); // result is in the form { count: number }
		apiUtils.apiResponse<number>(res, 200, {data: count}, this.modelSpec, this.publicSchema);
	}

  async create(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    
    // Validate and prepare the entity
    this.validate(req.body);
    const preparedEntity = await this.prepareDataForDb(req.userContext!, req.body, true); // calls prepareEntity, which uses Typebox to decode (json->typed object)
    
    const entity = await this.service.create(req.userContext!, preparedEntity);
    apiUtils.apiResponse<T>(res, 201, {data: entity || undefined}, this.modelSpec, this.publicSchema);
  }

  async fullUpdateById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    
    // Validate and prepare the entity
    this.validate(req.body);
    const preparedEntity = await this.prepareDataForDb(req.userContext!, req.body, false);
    
    const updateResult = await this.service.fullUpdateById(req.userContext!, req.params.id, preparedEntity);
    apiUtils.apiResponse<T>(res, 200, {data: updateResult}, this.modelSpec, this.publicSchema);
  }

	async partialUpdateById(req: Request, res: Response, next: NextFunction) {
		res.set('Content-Type', 'application/json');
		
    // Validate and prepare the entity (using partial validation for PATCH operations)
    this.validate(req.body, true);
    const preparedEntity = await this.prepareDataForDb(req.userContext!, req.body, false);
    
		const updateResult = await this.service.partialUpdateById(req.userContext!, req.params.id, preparedEntity);
		apiUtils.apiResponse<T>(res, 200, {data: updateResult}, this.modelSpec, this.publicSchema);
	}

  async deleteById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const deleteResult = await this.service.deleteById(req.userContext!, req.params.id);
    apiUtils.apiResponse<DeleteResult>(res, 200, {data: deleteResult}, this.modelSpec, this.publicSchema);
  }
}

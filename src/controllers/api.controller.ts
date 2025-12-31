import { Application, NextFunction, Request, Response } from 'express';
import { IEntity, IPagedResult, IModelSpec } from '@loomcore/common/models';
import type { AppId } from '@loomcore/common/types';
import { BadRequestError } from '../errors/index.js';
import { entityUtils } from '@loomcore/common/utils';
import { Value } from '@sinclair/typebox/value';
import { getIdSchema } from '@loomcore/common/validation';
import type { TSchema } from '@sinclair/typebox';

import { IGenericApiService } from '../services/index.js';
import { apiUtils } from '../utils/index.js';
import { DeleteResult } from '../databases/models/delete-result.js';
import { isAuthorized } from '../middleware/index.js';

export abstract class ApiController<T extends IEntity> {
  protected app: Application;
  protected service: IGenericApiService<T>;
  protected slug: string;
  protected apiResourceName: string;
  protected modelSpec?: IModelSpec;
  protected publicSpec?: IModelSpec;
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
    service: IGenericApiService<T>,
    resourceName: string = '',
    modelSpec?: IModelSpec,
    publicSpec?: IModelSpec
  ) {
    this.slug = slug;
    this.app = app;
    this.service = service;
    this.apiResourceName = resourceName;
    this.modelSpec = modelSpec;
    this.publicSpec = publicSpec;
    this.idSchema = getIdSchema();

    this.mapRoutes(app);
  }

  mapRoutes(app: Application) {
    // Map routes
    // have to bind "this" because when express calls the function we tell it to here, it won't have any context and "this" will be undefined in our functions
    app.get(`/api/${this.slug}`, isAuthorized(), this.get.bind(this));
    app.get(`/api/${this.slug}/all`, isAuthorized(), this.getAll.bind(this));
    app.get(`/api/${this.slug}/count`, isAuthorized(), this.getCount.bind(this));
    app.get(`/api/${this.slug}/:id`, isAuthorized(), this.getById.bind(this));
    app.post(`/api/${this.slug}`, isAuthorized(), this.create.bind(this));
    app.patch(`/api/${this.slug}/batch`, isAuthorized(), this.batchUpdate.bind(this));
    app.put(`/api/${this.slug}/:id`, isAuthorized(), this.fullUpdateById.bind(this));
    app.patch(`/api/${this.slug}/:id`, isAuthorized(), this.partialUpdateById.bind(this));
    app.delete(`/api/${this.slug}/:id`, isAuthorized(), this.deleteById.bind(this));
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

  async getAll(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const entities = await this.service.getAll(req.userContext!);
    apiUtils.apiResponse<T[]>(res, 200, { data: entities }, this.modelSpec, this.publicSpec);
  }

  async get(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');

    // Extract query options from request
    const queryOptions = apiUtils.getQueryOptionsFromRequest(req);

    // Get paged result from service
    const pagedResult = await this.service.get(req.userContext!, queryOptions);
    // Prepare API response
    apiUtils.apiResponse<IPagedResult<T>>(res, 200, { data: pagedResult }, this.modelSpec, this.publicSpec);
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    
    // Convert HTTP string to AppId using TypeBox
    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestError('ID parameter is required');
    }
    
    try {
      const id = Value.Convert(this.idSchema, idParam) as AppId;
      const entity = await this.service.getById(req.userContext!, id);
      apiUtils.apiResponse<T>(res, 200, { data: entity }, this.modelSpec, this.publicSpec);
    } catch (error: any) {
      throw new BadRequestError(`Invalid ID format: ${error.message || error}`);
    }
  }

  async getCount(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    const count = await this.service.getCount(req.userContext!); // result is in the form { count: number }
    apiUtils.apiResponse<number>(res, 200, { data: count }, this.modelSpec, this.publicSpec);
  }

  async create(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');

    // Validate request body
    this.validate(req.body);

    const entity = await this.service.create(req.userContext!, req.body);
    apiUtils.apiResponse<T>(res, 201, { data: entity || undefined }, this.modelSpec, this.publicSpec);
  }

  async batchUpdate(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');

    const entities = req.body as Partial<T>[];

    if (!Array.isArray(entities)) {
      // Using apiUtils to send a standardized error response would be better if available
      throw new BadRequestError('Request body must be an array of entities.');
    }

    // Convert HTTP string IDs to AppId using TypeBox
    const convertedEntities = entities.map(entity => {
      if (entity._id !== undefined) {
        try {
          const convertedId = Value.Convert(this.idSchema, entity._id) as AppId;
          return { ...entity, _id: convertedId };
        } catch (error: any) {
          throw new BadRequestError(`Invalid ID format for entity: ${error.message || error}`);
        }
      }
      return entity;
    });

    // Validate and prepare entities (using partial validation for PATCH operations)
    this.validateMany(convertedEntities, true);

    const updatedEntities = await this.service.batchUpdate(req.userContext!, convertedEntities);
    apiUtils.apiResponse<T[]>(res, 200, { data: updatedEntities }, this.modelSpec, this.publicSpec);
  }

  async fullUpdateById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');

    // Validate and prepare the entity
    this.validate(req.body);

    // Convert HTTP string to AppId using TypeBox
    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestError('ID parameter is required');
    }
    
    try {
      const id = Value.Convert(this.idSchema, idParam) as AppId;
      const updateResult = await this.service.fullUpdateById(req.userContext!, id, req.body);
      apiUtils.apiResponse<T>(res, 200, { data: updateResult }, this.modelSpec, this.publicSpec);
    } catch (error: any) {
      throw new BadRequestError(`Invalid ID format: ${error.message || error}`);
    }
  }

  async partialUpdateById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');

    // Validate and prepare the entity (using partial validation for PATCH operations)
    this.validate(req.body, true);

    // Convert HTTP string to AppId using TypeBox
    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestError('ID parameter is required');
    }
    
    try {
      const id = Value.Convert(this.idSchema, idParam) as AppId;
      const updateResult = await this.service.partialUpdateById(req.userContext!, id, req.body);
      apiUtils.apiResponse<T>(res, 200, { data: updateResult }, this.modelSpec, this.publicSpec);
    } catch (error: any) {
      throw new BadRequestError(`Invalid ID format: ${error.message || error}`);
    }
  }

  async deleteById(req: Request, res: Response, next: NextFunction) {
    res.set('Content-Type', 'application/json');
    
    // Convert HTTP string to AppId using TypeBox
    const idParam = req.params?.id;
    if (!idParam) {
      throw new BadRequestError('ID parameter is required');
    }
    
    try {
      const id = Value.Convert(this.idSchema, idParam) as AppId;
      const deleteResult = await this.service.deleteById(req.userContext!, id);
      apiUtils.apiResponse<DeleteResult>(res, 200, { data: deleteResult }, this.modelSpec, this.publicSpec);
    } catch (error: any) {
      throw new BadRequestError(`Invalid ID format: ${error.message || error}`);
    }
  }
}

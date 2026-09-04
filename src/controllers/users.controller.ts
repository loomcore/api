import {
  type IModelSpec,
  type IUser,
  PublicUserSpec,
  UserSpec,
} from '@loomcore/common/models';
import type { Application, Request, Response } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { Authorize } from '../decorators/authorize.decorator.js';
import { UserService } from '../services/index.js';
import { apiUtils } from '../utils/index.js';
import { ApiController } from './api.controller.js';

export interface UsersControllerOptions {
  userService: UserService;
  userSpec: IModelSpec;
  publicUserSpec: IModelSpec;
}

/** Admin for all inherited CRUD. Only getSelf / partialUpdateSelf are authenticated-only. */
@Authorize('admin')
export class UsersController extends ApiController<IUser> {
  public userService: UserService;

  constructor(
    app: Application,
    database: IDatabase,
    options: UsersControllerOptions = {
      userService: new UserService(database),
      userSpec: UserSpec,
      publicUserSpec: PublicUserSpec,
    },
  ) {
    super(
      'users',
      app,
      options.userService,
      'user',
      options.userSpec,
      options.publicUserSpec,
    );
    this.userService = options.userService;
  }

  override mapRoutes(app: Application): void {
    // Register /me before the base /:id routes so "me" is not captured as an id.
    app.get(
      `/api/${this.slug}/me`,
      this.authorize('getSelf'),
      this.getSelf.bind(this),
    );
    app.patch(
      `/api/${this.slug}/me`,
      this.authorize('partialUpdateSelf'),
      this.partialUpdateSelf.bind(this),
    );

    super.mapRoutes(app);
  }

  @Authorize()
  async getSelf(req: Request, res: Response): Promise<void> {
    res.set('Content-Type', 'application/json');
    
    const user = await this.userService.getById(
      req.userContext!,
      req.userContext!.user._id,
    );
    
    apiUtils.apiResponse<IUser>(
      res,
      200,
      { data: user },
      this.modelSpec,
      this.publicSpec,
    );
  }

  @Authorize()
  async partialUpdateSelf(req: Request, res: Response): Promise<void> {
    res.set('Content-Type', 'application/json');
    this.validate(req.body, true);
    
    const user = await this.userService.partialUpdateById(
      req.userContext!,
      req.userContext!.user._id,
      req.body,
    );
    
    apiUtils.apiResponse<IUser>(
      res,
      200,
      { data: user },
      this.modelSpec,
      this.publicSpec,
    );
  }
}

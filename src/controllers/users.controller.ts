import { Application } from 'express';

import { UserSpec, PublicUserSpec, IUser } from '@loomcore/common/models';
import { ApiController } from './api.controller.js';
import { isAuthorized } from '../middleware/index.js';
import { UserService } from '../services/index.js';
import { IDatabase } from '../databases/models/index.js';

export class UsersController extends ApiController<IUser> {
  public userService: UserService;

  constructor(app: Application, database: IDatabase) {
    const userService = new UserService(database);
    super('users', app, userService, 'user', UserSpec, PublicUserSpec);

    this.userService = userService;
  }

  override mapRoutes(app: Application) {
    // overriding the base routes to remove PUT - can't full update a user
    app.get(`/api/${this.slug}`, isAuthorized(), this.get.bind(this));
    app.get(`/api/${this.slug}/all`, isAuthorized(), this.getAll.bind(this));
    app.get(`/api/${this.slug}/find`, isAuthorized(), this.get.bind(this));
    app.get(`/api/${this.slug}/count`, isAuthorized(), this.getCount.bind(this));
    app.get(`/api/${this.slug}/:id`, isAuthorized(), this.getById.bind(this));
    app.post(`/api/${this.slug}`, isAuthorized(), this.create.bind(this));
    app.patch(`/api/${this.slug}/:id`, isAuthorized(), this.partialUpdateById.bind(this));
    app.delete(`/api/${this.slug}/:id`, isAuthorized(), this.deleteById.bind(this));
  }
}
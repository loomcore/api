import {Db} from 'mongodb';
import {Application, NextFunction, Request, Response} from 'express';

import {IUser, UserSpec, PublicUserSchema} from '@loomcore/common/models';
import {ApiController} from './api.controller.js';
import {isAuthenticated} from '../middleware/index.js';
import {UserService} from '../services/index.js';

export class UsersController extends ApiController<IUser> {
  private userService: UserService;

  constructor(app: Application, db: Db) {
    const userService = new UserService(db);
    super('users', app, userService, 'user', UserSpec, PublicUserSchema);

    this.userService = userService;
  }

  override mapRoutes(app: Application) {
    //super.mapRoutes(app); // map the base ApiController routes

	  // overriding the base routes to remove PUT - can't full update a user
	  app.get(`/api/${this.slug}`, isAuthenticated, this.get.bind(this));
	  app.get(`/api/${this.slug}/all`, isAuthenticated, this.getAll.bind(this));
	  app.get(`/api/${this.slug}/find`, isAuthenticated, this.get.bind(this));
	  app.get(`/api/${this.slug}/count`, isAuthenticated, this.getCount.bind(this));
	  app.get(`/api/${this.slug}/:id`, isAuthenticated, this.getById.bind(this));
	  app.post(`/api/${this.slug}`, isAuthenticated, this.create.bind(this));
	  app.patch(`/api/${this.slug}/:id`, isAuthenticated, this.partialUpdateById.bind(this));
	  app.delete(`/api/${this.slug}/:id`, isAuthenticated, this.deleteById.bind(this));
  }
}
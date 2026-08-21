import {
  type IModelSpec,
  type IUser,
  PublicUserSpec,
  UserSpec,
} from '@loomcore/common/models';
import type { Application } from 'express';
import type { IDatabase } from '../databases/models/index.js';
import { UserService } from '../services/index.js';
import { ApiController } from './api.controller.js';
export interface UsersControllerOptions {
  userService: UserService;
  userSpec: IModelSpec;
  publicUserSpec: IModelSpec;
}
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
}

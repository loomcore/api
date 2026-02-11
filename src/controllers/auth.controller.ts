import { Application, Request, Response, NextFunction } from 'express';
import {
  ILoginResponse,
  LoginResponseSpec,
  IUser,
  ITokenResponse,
  TokenResponseSpec,
  IUserContext,
  UserSpec,
  PublicUserSpec,
  passwordValidator,
  PublicUserContextSpec,
} from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';

import { BadRequestError, UnauthenticatedError } from '../errors/index.js';
import { apiUtils } from '../utils/index.js';

import { AuthService } from '../services/index.js';
import { UpdateResult } from '../databases/models/update-result.js';
import { IDatabase } from '../databases/models/index.js';
import { isAuthorized } from '../middleware/index.js';
import { PersonService } from '../services/person.service.js';

export class AuthController {
  authService: AuthService;
  personService: PersonService;
  constructor(app: Application, database: IDatabase) {
    this.authService = new AuthService(database);
    this.personService = new PersonService(database);
    this.mapRoutes(app);
  }

  mapRoutes(app: Application) {
    app.post(`/api/auth/login`, this.login.bind(this), this.afterAuth.bind(this));
    app.post(`/api/auth/register`, isAuthorized(), this.registerUser.bind(this));
    app.get(`/api/auth/refresh`, this.requestTokenUsingRefreshToken.bind(this));
    app.get(`/api/auth/get-user-context`, isAuthorized(), this.getUserContext.bind(this));
    app.patch(`/api/auth/change-password`, isAuthorized(), this.changePassword.bind(this));
    app.post(`/api/auth/forgot-password`, this.forgotPassword.bind(this));
    app.post(`/api/auth/reset-password`, this.resetPassword.bind(this));
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;
    res.set('Content-Type', 'application/json');

    const loginResponse = await this.authService.attemptLogin(req, res, email, password);

    apiUtils.apiResponse<ILoginResponse | null>(res, 200, { data: loginResponse }, LoginResponseSpec);
  }

  async registerUser(req: Request, res: Response) {
    const userContext = req.userContext;
    if (!userContext) {
      throw new BadRequestError('Missing required fields: userContext is required.');
    }

    const body = req.body;

    // Validate the incoming JSON
    let validationErrors = this.authService.validate(body.user);
    entityUtils.handleValidationResult(validationErrors, 'AuthController.registerUser');

    // if they provide a person it should be valid.
    if (body.person) {
      validationErrors = this.personService.validate(body.person);
      entityUtils.handleValidationResult(validationErrors, 'AuthController.registerUser');
    }
    const user = await this.authService.createUser(userContext, body.user, body.person);

    apiUtils.apiResponse<IUser>(res, 201, { data: user || undefined }, UserSpec, PublicUserSpec);
  }

  async requestTokenUsingRefreshToken(req: Request, res: Response, next: NextFunction) {
    const refreshToken = req.query.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new BadRequestError('Missing required fields: refreshToken is required.');
    }
    const deviceId = this.authService.getDeviceIdFromCookie(req);

    const tokens = await this.authService.requestTokenUsingRefreshToken(refreshToken, deviceId);

    if (tokens) {
      apiUtils.apiResponse<ITokenResponse>(res, 200, { data: tokens }, TokenResponseSpec);
    }
    else {
      throw new UnauthenticatedError();
    }
  }

  async getUserContext(req: Request, res: Response, next: NextFunction) {
    const userContext = req.userContext;
    apiUtils.apiResponse<IUserContext>(res, 200, { data: userContext }, PublicUserContextSpec);
  }

  afterAuth(req: Request, res: Response, loginResponse: any) {
    console.log('in afterAuth');
  }

  async changePassword(req: Request, res: Response) {
    const userContext = req.userContext!;
    const body = req.body;

    // Validate password in controller using the correct passwordValidator
    const validationErrors = entityUtils.validate(passwordValidator, { password: body.password });
    entityUtils.handleValidationResult(validationErrors, 'AuthController.changePassword');

    const updateResult = await this.authService.changeLoggedInUsersPassword(userContext, body);
    apiUtils.apiResponse<UpdateResult>(res, 200, { data: updateResult });
  }

  async forgotPassword(req: Request, res: Response) {
    const email = req.body?.email;

    const user = await this.authService.getUserByEmail(email);
    if (user) {
      // only try to send an email if we have a user with this email
      await this.authService.sendResetPasswordEmail(email);
    }

    apiUtils.apiResponse<any>(res, 200);
  }

  async resetPassword(req: Request, res: Response) {
    const { email, token, password } = req.body;

    if (!email || !token || !password) {
      throw new BadRequestError('Missing required fields: email, token, and password are required.');
    }

    const response = await this.authService.resetPassword(email, token, password);
    apiUtils.apiResponse<any>(res, 200, { data: response });
  }
}

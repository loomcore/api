import {Application, Request, Response, NextFunction} from 'express';
import {
  ILoginResponse, 
  LoginResponseSpec, 
  IUser, 
  ITokenResponse, 
  TokenResponseSpec, 
  IUserContext, 
  UserSpec, 
  PublicUserSchema, 
  UserContextSpec,
  passwordValidator
} from '@loomcore/common/models';
import {entityUtils} from '@loomcore/common/utils';

import {BadRequestError, UnauthenticatedError} from '../errors/index.js';
import {isAuthenticated} from '../middleware/index.js';
import { apiUtils} from '../utils/index.js';

import {AuthService} from '../services/index.js';
import { UpdateResult } from '../database/models/updateResult.js';
import { Database } from '../database/models/database.js';

export class AuthController {
  authService: AuthService;

  constructor(app: Application, database: Database) {
    const authService = new AuthService(database);
    this.authService = authService;

    this.mapRoutes(app);
  }

  mapRoutes(app: Application) {
    app.post(`/api/auth/login`, this.login.bind(this), this.afterAuth.bind(this));
    // todo: as soon as we get mongoDb initialization working, lock this (register) behind isAuthenticated
    app.post(`/api/auth/register`, this.registerUser.bind(this));
    app.get(`/api/auth/refresh`, this.requestTokenUsingRefreshToken.bind(this));
    app.get(`/api/auth/get-user-context`, isAuthenticated, this.getUserContext.bind(this));
	  app.patch(`/api/auth/change-password`, isAuthenticated, this.changePassword.bind(this));
	  app.post(`/api/auth/forgot-password`, this.forgotPassword.bind(this));
		app.post(`/api/auth/reset-password`, this.resetPassword.bind(this));
  }

  async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;
    res.set('Content-Type', 'application/json');

		const loginResponse = await this.authService.attemptLogin(req, res, email, password);
    apiUtils.apiResponse<ILoginResponse | null>(res, 200, {data: loginResponse}, LoginResponseSpec);
  }

  async registerUser(req: Request, res: Response) {
    const userContext = req.userContext;
    const body = req.body;
    
    // Validate the incoming JSON
    const validationErrors = this.authService.validate(body);
    entityUtils.handleValidationResult(validationErrors, 'AuthController.registerUser');
        
    // we're not handling errors here because createUser throws errors and middleware handles them
    const user = await this.authService.createUser(userContext!, body);
    
    apiUtils.apiResponse<IUser>(res, 201, {data: user || undefined}, UserSpec, PublicUserSchema);
  }

  async requestTokenUsingRefreshToken(req: Request, res: Response, next: NextFunction) {
    let tokens: ITokenResponse | null = await this.authService.requestTokenUsingRefreshToken(req);

    if (tokens) {
      apiUtils.apiResponse<ITokenResponse>(res, 200, {data: tokens}, TokenResponseSpec);
    }
    else {
			throw new UnauthenticatedError();
    }
  }

  async getUserContext(req: Request, res: Response, next: NextFunction) {
    const userContext = req.userContext;
    //const clientUserContext = {user: userContext!.user};
    apiUtils.apiResponse<IUserContext>(res, 200, {data: userContext}, UserContextSpec);
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
		apiUtils.apiResponse<UpdateResult>(res, 200, {data: updateResult});
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
		apiUtils.apiResponse<any>(res, 200, {data: response});
	}
}

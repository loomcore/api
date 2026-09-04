import {
  EmptyUserContext,
  getSystemUserContext,
  type ILoginResponse,
  type IModelSpec,
  type IOrganization,
  type ITokenResponse,
  type IUserContext,
  passwordValidator,
  PublicUserContextSpec,
  PublicUserSpec,
  TokenResponseSpec,
  UserSpec,
} from '@loomcore/common/models';
import { entityUtils } from '@loomcore/common/utils';
import type { Application, Request, Response } from 'express';
import { config } from '../config/base-api-config.js';
import type { IDatabase } from '../databases/models/index.js';
import type { UpdateResult } from '../databases/models/update-result.js';
import { BadRequestError, UnauthenticatedError } from '../errors/index.js';
import { OrganizationService, UserService } from '../services/index.js';
import {
  attemptLogin,
  authorizeMethod,
  createLoginResponseSpec,
  getAndSetDeviceIdCookie,
  getDeviceIdFromCookie,
  requestTokenUsingRefreshToken,
  resetPassword,
  sendResetPasswordEmail,
} from '../utils/auth/index.js';
import { apiUtils } from '../utils/index.js';
import { AllowAnonymous, Authorize } from '../decorators/authorize.decorator.js';

export interface AuthControllerOptions {
  userService: UserService;
  userSpec: IModelSpec;
  publicUserSpec: IModelSpec;
  publicUserContextSpec: IModelSpec;
}
export class AuthController {
  database: IDatabase;
  userService: UserService;
  organizationService: OrganizationService;
  userSpec: IModelSpec;
  publicUserSpec: IModelSpec;
  userContextSpec: IModelSpec;
  loginResponseSpec: IModelSpec;

  constructor(
    app: Application,
    database: IDatabase,
    options: AuthControllerOptions = {
      userService: new UserService(database),
      userSpec: UserSpec,
      publicUserSpec: PublicUserSpec,
      publicUserContextSpec: PublicUserContextSpec,
    },
  ) {
    this.database = database;
    this.userSpec = options.userSpec;
    this.publicUserSpec = options.publicUserSpec;
    this.userContextSpec = options.publicUserContextSpec;
    this.loginResponseSpec = createLoginResponseSpec(this.userContextSpec);
    this.userService = options.userService;
    this.organizationService = new OrganizationService(database);
    this.mapRoutes(app);
  }

  mapRoutes(app: Application) {
    const authorize = (method: string) => authorizeMethod(this, method);
    app.post(`/api/auth/login`, this.login.bind(this));
    app.get(`/api/auth/refresh`, this.requestTokenUsingRefreshToken.bind(this));
    app.get(`/api/auth/get-user-context`, authorize('getUserContext'), this.getUserContext.bind(this));
    app.patch(`/api/auth/change-password`, authorize('changePassword'), this.changePassword.bind(this));
    app.post(`/api/auth/forgot-password`, this.forgotPassword.bind(this));
    app.post(`/api/auth/reset-password`, this.resetPassword.bind(this));
  }

  async login(req: Request, res: Response) {
    const { email, password } = req.body as {
      email: string;
      password: string;
    };
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Missing required fields: email is required.');
    }
    if (!password || typeof password !== 'string') {
      throw new BadRequestError(
        'Missing required fields: password is required.',
      );
    }

    let organization: IOrganization | null = null;
    if (config.app.isMultiTenant) {
      const referer = req.get('referer') || req.headers.referer;
      if (!referer) {
        throw new BadRequestError(
          'Missing required fields: referer is required.',
        );
      }
      const domain = referer.split('/')[2];
      organization = await this.organizationService.findByDomain(
        EmptyUserContext,
        domain,
      );
      if (!organization) {
        throw new BadRequestError(
          `No organization found for domain: ${domain}`,
        );
      }
    }
    res.set('Content-Type', 'application/json');
    const deviceId = getAndSetDeviceIdCookie(req, res);

    const loginResponse = await attemptLogin(
      this.database,
      email,
      password,
      deviceId,
      organization,
      this.userService,
    );

    await this.afterAuth(req, res, loginResponse);

    apiUtils.apiResponse<ILoginResponse>(
      res,
      200,
      { data: loginResponse },
      this.loginResponseSpec,
    );
  }

  async requestTokenUsingRefreshToken(req: Request, res: Response) {
    const refreshToken = req.query.refreshToken;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new BadRequestError(
        'Missing required fields: refreshToken is required.',
      );
    }
    const deviceId = getDeviceIdFromCookie(req);

    const tokens = await requestTokenUsingRefreshToken(
      this.database,
      refreshToken,
      deviceId,
    );

    if (!tokens) {
      throw new UnauthenticatedError();
    }
    apiUtils.apiResponse<ITokenResponse>(
      res,
      200,
      { data: tokens },
      TokenResponseSpec,
    );
  }
  @Authorize()
  async getUserContext(req: Request, res: Response) {
    const userContext = req.userContext;
    apiUtils.apiResponse<IUserContext>(
      res,
      200,
      { data: userContext },
      this.userContextSpec,
    );
  }

  async afterAuth(
    _req: Request,
    _res: Response,
    _loginResponse: ILoginResponse,
  ): Promise<void> { }

  @Authorize()
  async changePassword(req: Request, res: Response) {
    const userContext = req.userContext;
    if (!userContext) {
      throw new BadRequestError(
        'Missing required fields: userContext is required.',
      );
    }
    const password = req.body?.password;

    // Validate password in controller using the correct passwordValidator
    const validationErrors = entityUtils.validate(
      this.userSpec,
      { password: password },
      true,
      passwordValidator,
    );
    entityUtils.handleValidationResult(
      validationErrors,
      'AuthController.changePassword',
    );

    await this.userService.changePassword(userContext, userContext.user._id, password);
    const updateResult = {
      success: true,
      count: 1,
    };
    apiUtils.apiResponse<UpdateResult>(res, 200, { data: updateResult });
  }

  async forgotPassword(req: Request, res: Response) {
    const email: string = req.body?.email;
    if (!email || typeof email !== 'string') {
      throw new BadRequestError('Missing required fields: email is required.');
    }
    let referer: string | undefined = req.get('referer') || req.headers.referer;
    if (!referer) {
      throw new BadRequestError(
        'Missing required fields: referer is required.',
      );
    }
    referer = referer.replace(/\/$/, '');
    let organization: IOrganization | null = null;
    if (config.app.isMultiTenant) {
      organization = await this.organizationService.findByDomain(
        EmptyUserContext,
        referer.split('/')[2],
      );
      if (!organization) {
        throw new BadRequestError(
          'Missing required fields: organization is required.',
        );
      }
    }

    const systemUserContext = getSystemUserContext();

    const user = await this.userService.findOne(systemUserContext, {
      filters: { email: { eq: email.toLowerCase() }, _orgId: { eq: organization?._id } },
    });

    if (user) {
      await sendResetPasswordEmail(
        systemUserContext,
        this.database,
        organization?._id,
        email,
        referer,
      );
    }

    apiUtils.apiResponse(res, 200);
  }

  async resetPassword(req: Request, res: Response) {
    const { email, token, password } = req.body as {
      email: string;
      token: string;
      password: string;
    };

    if (!email || !token || !password) {
      throw new BadRequestError(
        'Missing required fields: email, token, and password are required.',
      );
    }

    let organization: IOrganization | null = null;
    if (config.app.isMultiTenant) {
      const referer = req.get('referer') || req.headers.referer;
      if (!referer) {
        throw new BadRequestError(
          'Missing required fields: referer is required.',
        );
      }
      organization = await this.organizationService.findByDomain(
        EmptyUserContext,
        referer.split('/')[2],
      );

      if (!organization) {
        throw new BadRequestError(
          'Missing required fields: organization is required.',
        );
      }
    }

    const response = await resetPassword(
      this.database,
      email,
      token,
      password,
      organization,
      this.userService,
      this.userSpec,
    );
    apiUtils.apiResponse<UpdateResult>(res, 200, { data: response });
  }
}

import {
	EmptyUserContext,
	type ILoginResponse,
	type IModelSpec,
	type IOrganization,
	type ITokenResponse,
	type IUserContext,
	passwordValidator,
	TokenResponseSpec,
	UserSpec,
} from "@loomcore/common/models";
import { entityUtils } from "@loomcore/common/utils";
import type { Application, Request, Response } from "express";
import { config } from "../config/base-api-config.js";
import type { IDatabase } from "../databases/models/index.js";
import type { UpdateResult } from "../databases/models/update-result.js";
import { BadRequestError, UnauthenticatedError } from "../errors/index.js";
import { isAuthorized } from "../middleware/index.js";
import { OrganizationService, UserService } from "../services/index.js";
import {
	attemptLogin,
	changePassword,
	createUserContextSpec,
	getAndSetDeviceIdCookie,
	getDeviceIdFromCookie,
	requestTokenUsingRefreshToken,
	resetPassword,
	resolveAuthUserSpecs,
	sendResetPasswordEmail,
	setAuthUserContextSpec,
} from "../utils/auth/index.js";
import { apiUtils } from "../utils/index.js";

export interface AuthControllerOptions {
	/** Custom user service (e.g. built with an extended UserSpec). */
	userService?: UserService;
	/**
	 * Full user model spec including password (validation + JWT decode).
	 * If omitted, inherited from `userService.getModelSpec()` when that service
	 * uses a non-default UserSpec.
	 */
	userSpec?: IModelSpec;
	/**
	 * Public user model spec without password (login / get-user-context responses).
	 * Also used as a JWT decode fallback when no full userSpec is available.
	 */
	publicUserSpec?: IModelSpec;
}

export class AuthController {
	database: IDatabase;
	userService: UserService;
	organizationService: OrganizationService;
	userSpec: IModelSpec;
	publicUserSpec: IModelSpec;
	publicUserContextSpec: IModelSpec;
	loginResponseSpec: IModelSpec;

	constructor(
		app: Application,
		database: IDatabase,
		options: AuthControllerOptions = {},
	) {
		this.database = database;

		// Prefer an explicit userSpec; otherwise inherit from an injected userService
		// so hosts don't have to pass the same spec twice.
		const userSpecFromService = options.userService?.getModelSpec();
		const inheritedUserSpec =
			userSpecFromService && userSpecFromService !== UserSpec
				? userSpecFromService
				: undefined;
		const resolved = resolveAuthUserSpecs({
			userSpec: options.userSpec ?? inheritedUserSpec,
			publicUserSpec: options.publicUserSpec,
		});
		this.userSpec = resolved.userSpec;
		this.publicUserSpec = resolved.publicUserSpec;
		this.publicUserContextSpec = resolved.publicUserContextSpec;
		this.loginResponseSpec = resolved.loginResponseSpec;

		this.userService =
			options.userService ?? new UserService(database, this.userSpec);
		this.organizationService = new OrganizationService(database);

		// JWT decode must use the host user schema so extended fields survive
		// isAuthorized → req.userContext. Prefer the full userSpec; fall back to
		// publicUserSpec when that is the only extended schema the host provided.
		const jwtUserModelSpec =
			options.userSpec ?? inheritedUserSpec ?? options.publicUserSpec;
		if (jwtUserModelSpec) {
			setAuthUserContextSpec(createUserContextSpec(jwtUserModelSpec));
		}

		this.mapRoutes(app);
	}

	mapRoutes(app: Application) {
		app.post(
			`/api/auth/login`,
			this.login.bind(this),
			this.afterAuth.bind(this),
		);
		app.get(`/api/auth/refresh`, this.requestTokenUsingRefreshToken.bind(this));
		app.get(
			`/api/auth/get-user-context`,
			isAuthorized({ read: true }),
			this.getUserContext.bind(this),
		);
		app.patch(
			`/api/auth/change-password`,
			isAuthorized({ update: true }),
			this.changePassword.bind(this),
		);
		app.post(`/api/auth/forgot-password`, this.forgotPassword.bind(this));
		app.post(`/api/auth/reset-password`, this.resetPassword.bind(this));
	}

	async login(req: Request, res: Response) {
		const { email, password } = req.body as {
			email: string;
			password: string;
		};
		if (!email || typeof email !== "string") {
			throw new BadRequestError("Missing required fields: email is required.");
		}
		if (!password || typeof password !== "string") {
			throw new BadRequestError(
				"Missing required fields: password is required.",
			);
		}

		let organization: IOrganization | null = null;
		if (config.app.isMultiTenant) {
			const referer = req.get("referer") || req.headers.referer;
			if (!referer) {
				throw new BadRequestError(
					"Missing required fields: referer is required.",
				);
			}
			organization = await this.organizationService.findByDomain(
				EmptyUserContext,
				referer.split("/")[2],
			);
			if (!organization) {
				throw new BadRequestError(
					"Missing required fields: organization is required.",
				);
			}
		}
		res.set("Content-Type", "application/json");
		const deviceId = getAndSetDeviceIdCookie(req, res);

		const loginResponse = await attemptLogin(
			this.database,
			email,
			password,
			deviceId,
			organization,
			this.userService,
		);

		apiUtils.apiResponse<ILoginResponse | null>(
			res,
			200,
			{ data: loginResponse },
			this.loginResponseSpec,
		);
	}

	async requestTokenUsingRefreshToken(req: Request, res: Response) {
		const userContext = req.userContext;
		if (!userContext) {
			throw new BadRequestError(
				"Missing required fields: userContext is required.",
			);
		}
		const refreshToken = req.query.refreshToken;

		if (!refreshToken || typeof refreshToken !== "string") {
			throw new BadRequestError(
				"Missing required fields: refreshToken is required.",
			);
		}
		const deviceId = getDeviceIdFromCookie(req);

		const tokens = await requestTokenUsingRefreshToken(
			this.database,
			userContext,
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

	async getUserContext(req: Request, res: Response) {
		const userContext = req.userContext;
		apiUtils.apiResponse<IUserContext>(
			res,
			200,
			{ data: userContext },
			this.publicUserContextSpec,
		);
	}

	afterAuth(_req: Request, _res: Response, _loginResponse: any) {
		console.log("in afterAuth");
	}

	async changePassword(req: Request, res: Response) {
		const userContext = req.userContext;
		if (!userContext) {
			throw new BadRequestError(
				"Missing required fields: userContext is required.",
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
			"AuthController.changePassword",
		);

		const updateResult = await changePassword(
			this.database,
			userContext,
			password,
			this.userService,
		);
		apiUtils.apiResponse<UpdateResult>(res, 200, { data: updateResult });
	}

	async forgotPassword(req: Request, res: Response) {
		const email: string = req.body?.email;
		if (!email || typeof email !== "string") {
			throw new BadRequestError("Missing required fields: email is required.");
		}
		let referer: string | undefined = req.get("referer") || req.headers.referer;
		if (!referer) {
			throw new BadRequestError(
				"Missing required fields: referer is required.",
			);
		}
		referer = referer.replace(/\/$/, "");
		let organization: IOrganization | null = null;
		if (config.app.isMultiTenant) {
			organization = await this.organizationService.findByDomain(
				EmptyUserContext,
				referer.split("/")[2],
			);
			if (!organization) {
				throw new BadRequestError(
					"Missing required fields: organization is required.",
				);
			}
		}
		const userContext: IUserContext = {
			...EmptyUserContext,
			organization: organization || undefined,
		};

		const user = await this.userService.findOne(userContext, {
			filters: { email: { eq: email.toLowerCase() } },
		});

		if (user) {
			await sendResetPasswordEmail(
				this.database,
				email,
				referer,
				organization || undefined,
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
				"Missing required fields: email, token, and password are required.",
			);
		}

		let organization: IOrganization | null = null;
		if (config.app.isMultiTenant) {
			const referer = req.get("referer") || req.headers.referer;
			if (!referer) {
				throw new BadRequestError(
					"Missing required fields: referer is required.",
				);
			}
			organization = await this.organizationService.findByDomain(
				EmptyUserContext,
				referer.split("/")[2],
			);

			if (!organization) {
				throw new BadRequestError(
					"Missing required fields: organization is required.",
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

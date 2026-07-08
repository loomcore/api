import {
	EmptyUserContext,
	type ILoginResponse,
	type ITokenResponse,
	type IUser,
	type IUserContext,
	LoginResponseSpec,
	PublicUserContextSpec,
	PublicUserSpec,
	passwordValidator,
	TokenResponseSpec,
	UserSpec,
} from "@loomcore/common/models";
import type { AppIdType } from "@loomcore/common/types";
import { entityUtils } from "@loomcore/common/utils";
import type { Application, Request, Response } from "express";
import { config } from "../config/base-api-config.js";
import type { IDatabase } from "../databases/models/index.js";
import type { UpdateResult } from "../databases/models/update-result.js";
import {
	BadRequestError,
	ServerError,
	UnauthenticatedError,
} from "../errors/index.js";
import { isAuthorized } from "../middleware/index.js";
import { OrganizationService, UserService } from "../services/index.js";
import {
	attemptLogin,
	changePassword,
	getAndSetDeviceIdCookie,
	getDeviceIdFromCookie,
	requestTokenUsingRefreshToken,
	resetPassword,
	sendResetPasswordEmail,
} from "../utils/auth/index.js";
import { apiUtils } from "../utils/index.js";

export class AuthController {
	database: IDatabase;
	userService: UserService;
	organizationService: OrganizationService;
	constructor(app: Application, database: IDatabase) {
		this.database = database;
		this.userService = new UserService(database);
		this.organizationService = new OrganizationService(database);
		this.mapRoutes(app);
	}

	mapRoutes(app: Application) {
		app.post(
			`/api/auth/login`,
			this.login.bind(this),
			this.afterAuth.bind(this),
		);
		app.post(
			`/api/auth/register`,
			isAuthorized(),
			this.registerUser.bind(this),
		);
		app.get(`/api/auth/refresh`, this.requestTokenUsingRefreshToken.bind(this));
		app.get(
			`/api/auth/get-user-context`,
			isAuthorized(),
			this.getUserContext.bind(this),
		);
		app.patch(
			`/api/auth/change-password`,
			isAuthorized(),
			this.changePassword.bind(this),
		);
		app.post(`/api/auth/forgot-password`, this.forgotPassword.bind(this));
		app.post(`/api/auth/reset-password`, this.resetPassword.bind(this));
	}

	async login(req: Request, res: Response) {
		const { email, password, organizationId } = req.body as {
			email: string;
			password: string;
			organizationId?: AppIdType;
		};
		if (!email || typeof email !== "string") {
			throw new BadRequestError("Missing required fields: email is required.");
		}
		if (!password || typeof password !== "string") {
			throw new BadRequestError(
				"Missing required fields: password is required.",
			);
		}

		if (config.app.isMultiTenant && !organizationId) {
			throw new BadRequestError(
				"Missing required fields: organizationId is required.",
			);
		}
		res.set("Content-Type", "application/json");
		const deviceId = getAndSetDeviceIdCookie(req, res);

		const loginResponse = await attemptLogin(
			this.database,
			email,
			password,
			deviceId,
			organizationId,
		);

		apiUtils.apiResponse<ILoginResponse | null>(
			res,
			200,
			{ data: loginResponse },
			LoginResponseSpec,
		);
	}

	async registerUser(req: Request, res: Response) {
		const userContext = req.userContext;
		if (!userContext) {
			throw new BadRequestError(
				"Missing required fields: userContext is required.",
			);
		}

		const body = req.body;

		// Validate the incoming JSON
		const validationErrors = this.userService.validate(body.user);
		entityUtils.handleValidationResult(
			validationErrors,
			"AuthController.registerUser",
		);

		const user = await this.userService.create(userContext, body.user);

		if (!user) {
			throw new ServerError("Failed to create user");
		}

		apiUtils.apiResponse<IUser>(
			res,
			201,
			{ data: user },
			UserSpec,
			PublicUserSpec,
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
			PublicUserContextSpec,
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
			UserSpec,
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
		);
		apiUtils.apiResponse<UpdateResult>(res, 200, { data: updateResult });
	}

	async forgotPassword(req: Request, res: Response) {
		const email: string = req.body?.email;
		const organizationId: AppIdType | undefined = req.body?.organizationId;
		if (!email || typeof email !== "string") {
			throw new BadRequestError("Missing required fields: email is required.");
		}

		if (config.app.isMultiTenant && !organizationId) {
			throw new BadRequestError(
				"Missing required fields: organizationId is required.",
			);
		}

		let referer: string | undefined = req.get("referer") || req.headers.referer;
		if (!referer) {
			throw new BadRequestError(
				"Missing required fields: referer is required.",
			);
		}
		referer = referer.replace(/\/$/, "");

		const organization = organizationId
			? await this.organizationService.findOne(EmptyUserContext, {
					filters: { _id: { eq: organizationId } },
				})
			: null;
		const userContext: IUserContext = {
			...EmptyUserContext,
			organization: organization || undefined,
		};

		const user = await this.userService.findOne(userContext, {
			filters: { email: { eq: email.toLowerCase() } },
		});

		if (user) {
			await sendResetPasswordEmail(this.database, email, referer);
		}

		apiUtils.apiResponse(res, 200);
	}

	async resetPassword(req: Request, res: Response) {
		const {
			email,
			token,
			password,
			organizationId,
		}: {
			email: string;
			token: string;
			password: string;
			organizationId?: AppIdType;
		} = req.body;

		if (!email || !token || !password) {
			throw new BadRequestError(
				"Missing required fields: email, token, and password are required.",
			);
		}

		if (config.app.isMultiTenant && !organizationId) {
			throw new BadRequestError(
				"Missing required fields: organizationId is required.",
			);
		}

		const response = await resetPassword(
			this.database,
			email,
			token,
			password,
			organizationId,
		);
		apiUtils.apiResponse<UpdateResult>(res, 200, { data: response });
	}
}

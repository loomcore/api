import {
	EmptyUserContext,
	type ILoginResponse,
	type IOrganization,
	type ITokenResponse,
	type IUserContext,
	LoginResponseSpec,
	PublicUserContextSpec,
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
		);

		apiUtils.apiResponse<ILoginResponse | null>(
			res,
			200,
			{ data: loginResponse },
			LoginResponseSpec,
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
			await sendResetPasswordEmail(this.database, email, referer);
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
		);
		apiUtils.apiResponse<UpdateResult>(res, 200, { data: response });
	}
}

import type { IUserContext } from "@loomcore/common/models";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
	BadRequestError,
	UnauthenticatedError,
	UnauthorizedError,
} from "../errors/index.js";
import type {
	FeatureRequirement,
	MethodAuth,
} from "../models/method-auth.model.js";
import { getAuthUserContextSpec } from "../utils/auth/auth-user-specs.util.js";
import { getAuthConfig } from "../utils/auth/get-auth-config.util.js";
import { isAdmin } from "../utils/auth/is-admin.util.js";

type AuthMethod = keyof MethodAuth;

function resolveAuthMethod(req: Request): AuthMethod | null {
	switch (req.method.toUpperCase()) {
		case "GET":
		case "HEAD":
			return "read";
		case "POST":
			return "create";
		case "PUT":
		case "PATCH":
			return "update";
		case "DELETE":
			return "delete";
		default:
			return null;
	}
}

function assertFeatureRequirement(
	userContext: IUserContext,
	requirement?: FeatureRequirement,
): void {
	if (requirement === undefined) {
		throw new UnauthorizedError();
	}
	if (requirement === true) {
		return;
	}
	if (
		!requirement.some((feature) => userContext.authorizations.some(
			(authorization) => authorization.feature === feature,
		))
	) {
		throw new UnauthorizedError();
	}
}

const isAuthorized = (config: MethodAuth) => {
	return (req: Request, _res: Response, next: NextFunction) => {
		let token: string | null = null;

		if (req.headers?.authorization) {
			const authHeader = req.headers.authorization;
			const authHeaderArray = authHeader.split("Bearer ");
			if (authHeaderArray?.length > 1) {
				token = authHeaderArray[1];
			}
		}

		if (!token) {
			throw new UnauthenticatedError();
		}

		const authConfig = getAuthConfig();

		const rawPayload = jwt.verify(token, authConfig.clientSecret);
		const userContext = getAuthUserContextSpec().decode(
			rawPayload,
		) as IUserContext;

		req.userContext = userContext;

		const method = resolveAuthMethod(req);
		if (!method) {
			throw new BadRequestError("Invalid HTTP method");
		}

		assertFeatureRequirement(userContext, config[method]);
		next();
	};
};

export { isAuthorized };

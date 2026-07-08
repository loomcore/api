import { type IUserContext, UserContextSpec } from "@loomcore/common/models";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UnauthenticatedError, UnauthorizedError } from "../errors/index.js";
import { getAuthConfig } from "../utils/auth/get-auth-config.util.js";

// Shared middleware implementation
const isAuthorized = (allowedFeatures?: string[]) => {
	return (req: Request, _res: Response, next: NextFunction) => {
		let token = null;

		// check Authorization Header
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

		try {
			// Get raw JWT payload first
			const rawPayload = jwt.verify(token, authConfig.clientSecret);

			// Use TypeBox to decode the payload properly, which will convert string dates to Date objects
			const userContext = UserContextSpec.decode(rawPayload) as IUserContext;

			req.userContext = userContext;

			if (
				userContext.authorizations.some(
					(authorization) => authorization.feature === "admin",
				)
			) {
				next();
			} else if (allowedFeatures?.length) {
				if (
					!userContext.authorizations.some((authorization) =>
						allowedFeatures.includes(authorization.feature),
					)
				) {
					throw new UnauthorizedError();
				}
				next();
			} else {
				next();
			}
		} catch (err) {
			console.error(err);
			throw new UnauthenticatedError();
		}
	};
};

export { isAuthorized };

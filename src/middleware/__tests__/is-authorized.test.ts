import type { IUserContext } from "@loomcore/common/models";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthenticatedError, UnauthorizedError } from "../../errors/index.js";
import {
	adminWrites,
	authenticated,
	isAuthorized,
	type MethodAuth,
} from "../index.js";

vi.mock("../../utils/auth/get-auth-config.util.js", () => ({
	getAuthConfig: () => ({ clientSecret: "test-secret" }),
}));

vi.mock("../../utils/auth/auth-user-specs.util.js", () => ({
	getAuthUserContextSpec: () => ({
		decode: (payload: unknown) => payload,
	}),
}));

function makeUserContext(
	features: string[],
): IUserContext {
	return {
		user: { _id: 1, email: "u@test.com" } as IUserContext["user"],
		organization: { _id: 1, name: "Org" } as IUserContext["organization"],
		authorizations: features.map((feature, index) => ({
			_id: String(index),
			_orgId: 1,
			role: feature,
			feature,
			config: {},
		})),
	};
}

function makeReq(
	method: string,
	userContext: IUserContext,
): Request {
	const token = jwt.sign(userContext, "test-secret");
	return {
		method,
		headers: { authorization: `Bearer ${token}` },
		userContext: undefined,
	} as unknown as Request;
}

describe("isAuthorized", () => {
	let next: NextFunction;

	beforeEach(() => {
		next = vi.fn() as unknown as NextFunction;
	});

	it("throws UnauthenticatedError when no token is present", () => {
		const middleware = isAuthorized(authenticated);
		const req = { method: "GET", headers: {} } as Request;

		expect(() => middleware(req, {} as Response, next)).toThrow(
			UnauthenticatedError,
		);
		expect(next).not.toHaveBeenCalled();
	});

	it("allows admin for any method regardless of config", () => {
		const middleware = isAuthorized(adminWrites);
		const req = makeReq("DELETE", makeUserContext(["admin"]));

		middleware(req, {} as Response, next);

		expect(next).toHaveBeenCalled();
		expect(req.userContext).toBeDefined();
	});

	it("allows authenticated read when read is true", () => {
		const middleware = isAuthorized(adminWrites);
		const req = makeReq("GET", makeUserContext(["agent"]));

		middleware(req, {} as Response, next);

		expect(next).toHaveBeenCalled();
	});

	it("denies create when create requires admin", () => {
		const middleware = isAuthorized(adminWrites);
		const req = makeReq("POST", makeUserContext(["agent"]));

		expect(() => middleware(req, {} as Response, next)).toThrow(
			UnauthorizedError,
		);
		expect(next).not.toHaveBeenCalled();
	});

	it("denies when the method bucket is missing", () => {
		const config: MethodAuth = { read: true };
		const middleware = isAuthorized(config);
		const req = makeReq("PATCH", makeUserContext(["agent"]));

		expect(() => middleware(req, {} as Response, next)).toThrow(
			UnauthorizedError,
		);
	});

	it("allows update when update is true", () => {
		const middleware = isAuthorized({
			read: true,
			update: true,
			delete: ["admin"],
		});
		const req = makeReq("PATCH", makeUserContext(["agent"]));

		middleware(req, {} as Response, next);

		expect(next).toHaveBeenCalled();
	});

	it("treats PUT as update", () => {
		const middleware = isAuthorized({ update: true });
		const req = makeReq("PUT", makeUserContext(["agent"]));

		middleware(req, {} as Response, next);

		expect(next).toHaveBeenCalled();
	});
});

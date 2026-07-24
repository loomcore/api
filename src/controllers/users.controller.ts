import {
	type IModelSpec,
	type IUser,
	PublicUserSpec,
	UserSpec,
} from "@loomcore/common/models";
import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import type { MethodAuth } from "../middleware/index.js";
import { UserService } from "../services/index.js";
import { ApiController } from "./api.controller.js";

/** Authenticated reads/creates/updates; delete requires admin. Ownership enforced in UserService. */
export const usersRouteAuth: MethodAuth = {
	read: true,
	create: true,
	update: true,
	delete: ["admin"],
};

export interface UsersControllerOptions {
	userService?: UserService;
	userSpec?: IModelSpec;
	publicUserSpec?: IModelSpec;
}

export class UsersController extends ApiController<IUser> {
	public userService: UserService;

	constructor(
		app: Application,
		database: IDatabase,
		options: UsersControllerOptions = {},
	) {
		const userSpec = options.userSpec ?? UserSpec;
		const publicUserSpec = options.publicUserSpec ?? PublicUserSpec;
		const userService =
			options.userService ?? new UserService(database, userSpec);
		super(
			"users",
			app,
			userService,
			usersRouteAuth,
			"user",
			userSpec,
			publicUserSpec,
		);
		this.userService = userService;
	}
}

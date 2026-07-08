import { type IUser, PublicUserSpec, UserSpec } from "@loomcore/common/models";
import type { Application } from "express";
import type { IDatabase } from "../databases/models/index.js";
import { UserService } from "../services/index.js";
import { ApiController } from "./api.controller.js";

export class UsersController extends ApiController<IUser> {
	public userService: UserService;

	constructor(app: Application, database: IDatabase) {
		const userService = new UserService(database);
		super("users", app, userService, "user", UserSpec, PublicUserSpec);
		this.userService = userService;
	}
}

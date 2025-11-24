import {Application, NextFunction, Request, Response} from 'express';

import {IOrganization} from '@loomcore/common/models';

import {ApiController} from './api.controller.js';
import {isAuthenticated} from '../middleware/index.js';
import {apiUtils} from '../utils/index.js';
import {BadRequestError, IdNotFoundError} from '../errors/index.js';
import {OrganizationService} from '../services/index.js';
import { IDatabase } from '../databases/models/index.js';

/**
 * OrganizationsController is unique, just like its service, because Organizations are not multi-tenant
 * entities, requiring an orgId in addition to its primary key id. The primary key is the orgId.
 */
export class OrganizationsController extends ApiController<IOrganization> {
	orgService: OrganizationService;

	constructor(app: Application, database: IDatabase) {
		const orgService = new OrganizationService(database);
		super('organizations', app, orgService);
		this.orgService = orgService;
	}

	override mapRoutes(app: Application) {
		super.mapRoutes(app); // map the base ApiController routes

		app.get(`/api/${this.slug}/get-by-name/:name`, isAuthenticated, this.getByName.bind(this));
		app.get(`/api/${this.slug}/get-by-code/:code`, isAuthenticated, this.getByCode.bind(this));
	}

	async getByName(req: Request, res: Response, next: NextFunction) {
		console.log('in OrganizationController.getByName');
		let name = req.params?.name;
		try {
			res.set('Content-Type', 'application/json');
			const entity = await this.orgService.findOne(req.userContext!, { filters: { name: { regex: new RegExp(`^${name}$`, 'i') } } });
			if (!entity) throw new BadRequestError('Name not found');

			apiUtils.apiResponse<IOrganization>(res, 200, {data: entity});
		}
		catch (err: any) {
			next(err);
			return;
		}
	}

	async getByCode(req: Request, res: Response, next: NextFunction) {
		let code = req.params?.code;
		try {
			res.set('Content-Type', 'application/json');
			const entity = await this.orgService.findOne(req.userContext!, { filters: { code: { eq: code } } });
			if (!entity) throw new BadRequestError('Code not found');

			apiUtils.apiResponse<IOrganization>(res, 200, {data: entity});
		}
		catch (err: any) {
			next(err);
			return;
		}
	}

}

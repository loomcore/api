import { Application, NextFunction, Request, Response } from 'express';

import { IOrganization } from '@loomcore/common/models';

import { ApiController } from './api.controller.js';
import { apiUtils } from '../utils/index.js';
import { BadRequestError } from '../errors/index.js';
import { OrganizationService } from '../services/index.js';
import { IDatabase } from '../databases/models/index.js';
import { isAuthorized } from '../middleware/index.js';

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

		app.get(`/api/${this.slug}/get-by-name/:name`, isAuthorized(), this.getByName.bind(this));
		app.get(`/api/${this.slug}/get-by-code/:code`, isAuthorized(), this.getByCode.bind(this));
	}

	async getByName(req: Request<{ name: string }>, res: Response, next: NextFunction) {
		console.log('in OrganizationController.getByName');
		const { name } = req.params;
		try {
			res.set('Content-Type', 'application/json');
			const entity = await this.orgService.findOne(req.userContext!, { filters: { name: { contains: name } } });
			if (!entity) throw new BadRequestError('Name not found');

			apiUtils.apiResponse<IOrganization>(res, 200, { data: entity });
		}
		catch (err: any) {
			next(err);
			return;
		}
	}

	async getByCode(req: Request<{ code: string }>, res: Response, next: NextFunction) {
		const { code } = req.params;
		try {
			res.set('Content-Type', 'application/json');
			const entity = await this.orgService.findOne(req.userContext!, { filters: { code: { eq: code } } });
			if (!entity) throw new BadRequestError('Code not found');

			apiUtils.apiResponse<IOrganization>(res, 200, { data: entity });
		}
		catch (err: any) {
			next(err);
			return;
		}
	}

}

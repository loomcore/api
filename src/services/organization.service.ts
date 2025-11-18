import {Db, DeleteResult, Document, FindOptions, ObjectId} from 'mongodb';
import _ from 'lodash';

import { GenericApiService2 } from './generic-api.service-v2.js';
import {IOrganization, IUserContext, OrganizationSpec} from '@loomcore/common/models';
import { NotFoundError } from '../errors/index.js';

export class OrganizationService extends GenericApiService2<IOrganization> {
	constructor(db: Db) {
		super(db, 'organizations', 'organization', OrganizationSpec);
	}

	async getAuthTokenByRepoCode(userContext: IUserContext, orgId: string) {
		// until we implement repos, we use orgId - repos are a feature providing separate data repositories for a single org
		const org = await this.getById(userContext, orgId);
		return org ? org.authToken : null;
	}

	async validateRepoAuthToken(userContext: IUserContext, orgCode: string, authToken: string): Promise<string | null> {
		// this is used to auth content-api calls - the orgCode is used in the api call hostname
		const org = await this.findOne(userContext, { code: orgCode });

		if (!org) {
			return null;
		}

		const orgId = org.authToken === authToken ? org._id.toString() : null;

		return orgId;
	}

	async getMetaOrg(userContext: IUserContext): Promise<IOrganization | null> {
		const org = await this.findOne(userContext, { isMetaOrg: true });
		return org;
	}
}
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import {IOrganization, IUserContext, OrganizationSpec} from '@loomcore/common/models';
import { IDatabase } from '../databases/models/database.interface.js';

export class OrganizationService extends GenericApiService<IOrganization> {
	constructor(database: IDatabase) {
		super(database, 'organizations', 'organization', OrganizationSpec);
	}

	async getAuthTokenByRepoCode(userContext: IUserContext, orgId: string) : Promise<string | null> {
		// until we implement repos, we use orgId - repos are a feature providing separate data repositories for a single org
		const org = await this.getById(userContext, orgId);
		return org?.authToken ?? null;
	}

	async validateRepoAuthToken(userContext: IUserContext, orgCode: string, authToken: string): Promise<string | null> {
		// this is used to auth content-api calls - the orgCode is used in the api call hostname
		const org = await this.findOne(userContext, { filters: { code: { eq: orgCode } } });

		if (!org) {
			return null;
		}

		const orgId = org.authToken === authToken ? org._id.toString() : null;

		return orgId;
	}

	async getMetaOrg(userContext: IUserContext): Promise<IOrganization | null> {
		const org = await this.findOne(userContext, { filters: { isMetaOrg: { eq: true } } });
		return org;
	}
}
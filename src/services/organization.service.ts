import { GenericApiService } from './generic-api-service/generic-api.service.js';
import { IOrganization, IUserContext, OrganizationSpec } from '@loomcore/common/models';
import { IDatabase } from '../databases/models/database.interface.js';
import { BadRequestError } from '../errors/index.js';

export class OrganizationService extends GenericApiService<IOrganization> {
	constructor(database: IDatabase) {
		super(database, 'organizations', 'organization', OrganizationSpec);
	}

	override async preprocessEntity(userContext: IUserContext, entity: Partial<IOrganization>, isCreate: boolean, allowId: boolean = true): Promise<Partial<IOrganization>> {
		if (isCreate) {
			const metaOrg = await this.getMetaOrg(userContext);
			if (metaOrg && entity.isMetaOrg) {
				throw new BadRequestError('Meta organization already exists');
			}
			if (metaOrg && userContext._orgId !== metaOrg._id) {
				throw new BadRequestError('User is not authorized to create an organization');
			}
		}
		const result = await super.preprocessEntity(userContext, entity, isCreate, allowId);
		return result;
	}

	// TODO: override prepareQuery to add check for isMetaOrg.
	// If user is not meta org, throw error.
	async getAuthTokenByRepoCode(userContext: IUserContext, orgId: string): Promise<string | null> {
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
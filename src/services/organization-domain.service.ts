import {
	type IOrganizationDomain,
	OrganizationDomainSpec,
} from "@loomcore/common/models";
import type { IDatabase } from "../databases/models/index.js";
import { GenericApiService } from "./generic-api-service/generic-api.service.js";

export class OrganizationDomainService extends GenericApiService<IOrganizationDomain> {
	constructor(database: IDatabase) {
		super(
			database,
			"organization_domains",
			"organization_domain",
			OrganizationDomainSpec,
		);
	}
}

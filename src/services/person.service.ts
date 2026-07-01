import { type IPersonModel, personModelSpec } from "@loomcore/common/models";
import type { IDatabase } from "../databases/models/index.js";
import { MultiTenantApiService } from "./multi-tenant-api.service.js";

export class PersonService extends MultiTenantApiService<IPersonModel> {
	constructor(database: IDatabase) {
		super(database, "persons", "person", personModelSpec);
	}
}

import type { IAppConfig } from "./app-config.interface.js";
import type { IDatabaseConfig } from "./database-config.interface.js";
import type { IEmailConfig } from "./email-config.interface.js";

export interface IInitialDbMigrationConfig {
	env: string;
	app: IAppConfig;
	database: IDatabaseConfig;
	adminUser: {
		email: string;
		password: string;
	};
	multiTenant: {
		metaOrgName: string;
		metaOrgCode: string;
		metaOrgDomain: string;
	};
	email?: IEmailConfig;
}

import type { IAppConfig } from "./app-config.interface.js";
import type { IAuthConfig } from "./auth-config.interface.js";
import type { IDatabaseConfig } from "./database-config.interface.js";
import type { IEmailClient } from "./email-client.interface.js";
import type { IEmailConfig } from "./email-config.interface.js";

export interface IBaseApiConfig {
	app: IAppConfig;
	auth?: IAuthConfig;
	database: IDatabaseConfig;
	debug?: {
		showErrors?: boolean;
	};
	email?: IEmailConfig;
	env: string;
	network: {
		corsAllowedOrigins: string[];
		externalPort?: number;
		hostName: string;
		internalPort?: number;
	};
	thirdPartyClients?: {
		emailClient?: IEmailClient;
	};
}

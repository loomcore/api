import { IAppConfig } from "./app-config.interface.js";
import { IAuthConfig } from "./auth-config.interface.js";
import { IDatabaseConfig } from "./database-config.interface.js";
import { IEmailConfig } from "./email-config.interface.js";
import { IEmailClient } from "./email-client.interface.js";

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
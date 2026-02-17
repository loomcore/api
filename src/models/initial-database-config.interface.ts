import { IAppConfig } from "./app-config.interface.js";
import { IDatabaseConfig } from "./database-config.interface.js";
import { IEmailConfig } from "./email-config.interface.js";

export interface IInitialDbMigrationConfig {
  app: IAppConfig;
  database: IDatabaseConfig;
  adminUser: {
    email: string;
    password: string;
  };
  multiTenant: {
    metaOrgName: string;
    metaOrgCode: string;
  };
  email?: IEmailConfig;
}
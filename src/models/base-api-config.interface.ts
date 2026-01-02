import { DbType } from "../databases/db-type.type.js";
import { IAuthConfig } from "./auth-config.interface.js";
import { IEmailConfig } from "./email-config.interface.js";
import { IMultiTenantConfig } from "./multi-tenant-config.interface.js";

export interface IBaseApiConfig {
  /**
   * app is global configuration for the app. These values should be hardcoded and not changed 
   * from environment to environment..
   */
  app: {
    dbType: DbType;
    isMultiTenant: boolean;
    isAuthEnabled: boolean;
    name: string;
    primaryTimezone?: string;
  };
  auth?: IAuthConfig;
  database: {
    host: string;
    name: string;
    password: string;
    port: number;
    username: string;
  };
  debug?: {
    showErrors?: boolean;
  };
  email?: IEmailConfig;
  env: string;
  multiTenant?: IMultiTenantConfig;
  network: {
    corsAllowedOrigins: string[];
    externalPort?: number;
    hostName: string;
    internalPort?: number;
  };
}
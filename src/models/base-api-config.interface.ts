import { DbType } from "../databases/db-type.type.js";
import { IAuthConfig } from "./auth-config.interface.js";

export interface IBaseApiConfig {
  /**
   * app is global configuration for the app. These values should be hardcoded and not changed 
   * from environment to environment..
   */
  app: {
    dbType?: DbType;
    isMultiTenant: boolean;
    metaOrgCode?: string;
    metaOrgName?: string;
    name: string;
    primaryTimezone?: string;
  },
  auth?: IAuthConfig,
  database?: {
    host: string;
    name: string;
    password: string;
    port: number;
    username: string;
  },
  debug?: {
    showErrors?: boolean;
  },
  email?: {
    emailApiKey: string;
    emailApiSecret: string;
    fromAddress: string;
    systemEmailAddress: string;
  },
  env: string;
  network: {
    corsAllowedOrigins: string[];
    externalPort?: number;
    hostName: string;
    internalPort?: number;
  }
}
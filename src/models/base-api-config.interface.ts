import { DbType } from "../databases/db-type.type.js";

export interface IBaseApiConfig {
  appName: string;
  env: string;
  hostName: string;
  clientSecret: string;
  database: {
		name?: string;
    host?: string;
		port?: number;
		user?: string;
		password?: string;
	},
  externalPort?: number;
  internalPort?: number;
  corsAllowedOrigins: string[];
  saltWorkFactor?: number;
  jobTypes?: string;
  deployedBranch?: string;
  debug?: {
    showErrors?: boolean;
  },
  /**
   * app is global configuration for the app. These values should be hardcoded and not changed 
   * from environment to environment..
   */
  app: {
    isMultiTenant: boolean;
    metaOrgName?: string;
    metaOrgCode?: string;
    dbType?: DbType;
    primaryTimezone?: string;
  },
  // todo: Is there a better way to handle this? It feels wrong to have such an important secret that is not needed at runtime
  //  treated as such a first class citizen and so easily accessible. Consider tucking this away into a more "one-time setup" location.
  adminUser?: {
    email: string;
    password: string;
  }
  auth: {
    jwtExpirationInSeconds: number;
    refreshTokenExpirationInDays: number;
    deviceIdCookieMaxAgeInDays: number;
    passwordResetTokenExpirationInMinutes: number;
  },
  email?: {
    emailApiKey: string;
    emailApiSecret: string;
    fromAddress: string;
    systemEmailAddress: string;
  }
}
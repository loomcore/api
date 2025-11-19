import { DatabaseType } from "../databases/types/databaseType.js";

export interface IBaseApiConfig {
  appName: string;
  env: string;
  hostName: string;
  clientSecret: string;
  database: {
    type: DatabaseType,
    name?: string;
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
  },
  auth: {
    jwtExpirationInSeconds: number;
    refreshTokenExpirationInDays: number;
    deviceIdCookieMaxAgeInDays: number;
    passwordResetTokenExpirationInMinutes: number;
  },
  email: {
    emailApiKey?: string;
    emailApiSecret?: string;
    fromAddress?: string;
    systemEmailAddress?: string;
  }
}
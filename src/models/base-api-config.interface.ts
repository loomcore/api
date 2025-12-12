export interface IBaseApiConfig {
  appName: string;
  env: string;
  hostName: string;
  clientSecret: string;
  database: {
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
    metaOrgName?: string;
    metaOrgCode?: string;
  },
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
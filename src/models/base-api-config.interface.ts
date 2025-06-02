export interface IBaseApiConfig {
  appName: string;
  env: string;
  hostName: string;
  clientSecret: string;
  mongoDbUrl?: string;
  databaseName?: string;
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
    multiTenant: boolean; // I don't think this is used currently
  },
  auth: {
    jwtExpirationInSeconds: number;
    refreshTokenExpirationInDays: number;
    deviceIdCookieMaxAgeInDays: number;
    passwordResetTokenExpirationInMinutes: number;
  },
  email: {
    sendGridApiKey?: string;
    fromAddress?: string;
  }
}
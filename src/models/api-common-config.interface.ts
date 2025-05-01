export interface IApiCommonConfig {
  env: string;
  hostName: string;
  appName: string;
  clientSecret: string;
  debug?: {
    showErrors?: boolean;
  },
  /**
   * Global configuration for the app. These values should be hardcoded and not changed 
   * from environment to environment..
   */
  app: {
    multiTenant: boolean;
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
  };
}
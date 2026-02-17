import { DbType } from "../databases/db-type.type.js";

/**
 * Global configuration for the app. These values should be hardcoded and not changed
 * from environment to environment.
 */
export interface IAppConfig {
  dbType: DbType;
  isMultiTenant: boolean;
  isAuthEnabled: boolean;
  name: string;
  primaryTimezone?: string;
}

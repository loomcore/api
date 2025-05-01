import {IApiCommonConfig} from './api-common-config.interface.js';

// todo: see if we can merge this with IApiCommonConfig (why do we need both?). Currently IApiCommonConfig is config that is used
//  inside the @loomcore/api library, but IBaseApiConfig contains config that is used inside the api project. I think we should move more
//  of the functionality that uses these properties into @loomcore/api.
export interface IBaseApiConfig {
  mongoDbUrl?: string;
  databaseName?: string;
  externalPort?: number;
  internalPort?: number;
  corsAllowedOrigins: string[];
  saltWorkFactor?: number;
  jobTypes?: string;
  deployedBranch?: string;
  api: IApiCommonConfig;
}
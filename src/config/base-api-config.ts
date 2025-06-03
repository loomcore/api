import {IBaseApiConfig} from '../models/index.js';

export let config: IBaseApiConfig;
let isConfigSet = false;

// Utility function to pick only IBaseApiConfig properties. We ignore any extended properties that are not in IBaseApiConfig.
function copyOnlyBaseApiConfigProperties<T extends IBaseApiConfig>(obj: T): IBaseApiConfig {
  const baseConfig: IBaseApiConfig = {} as IBaseApiConfig;
  (Object.keys(obj) as (keyof IBaseApiConfig)[]).forEach((key) => {
    (baseConfig as any)[key] = obj[key];
  });
  return baseConfig;
}

export function setBaseApiConfig(apiConfig: IBaseApiConfig) {
  if (!isConfigSet) {
    config = copyOnlyBaseApiConfigProperties(apiConfig);
    isConfigSet = true;
  } else if (config.env !== 'test') {
    console.warn('BaseApiConfig data has already been set. Ignoring subsequent calls to setBaseApiConfig.');
  }
}

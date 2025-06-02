import {IBaseApiConfig} from '../models/index.js';

export let config: IBaseApiConfig;
let isConfigSet = false;

export function setBaseApiConfig(baseApiConfig: IBaseApiConfig) {
  if (!isConfigSet) {
    config = baseApiConfig;
    isConfigSet = true;
  } else if (config.env !== 'test') {
    console.warn('BaseApiConfig data has already been set. Ignoring subsequent calls to setBaseApiConfig.');
  }
}

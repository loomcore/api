import {IApiCommonConfig} from '../models/index.js';

export let config: IApiCommonConfig;
let isConfigSet = false;

export function setApiCommonConfig(apiCommonConfig: IApiCommonConfig) {
  if (!isConfigSet) {
    config = apiCommonConfig;
    isConfigSet = true;
  } else {
    console.warn('ApiCommonConfig data has already been set. Ignoring subsequent calls to setApiCommonConfig.');
  }
}

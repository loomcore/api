import { EmptyUserContext, initializeSystemUserContext } from '@loomcore/common/models';
import { IBaseApiConfig } from '../models/index.js';
import { IDatabase } from '../databases/models/index.js';

export let config: IBaseApiConfig;
let isConfigSet = false;
let isSystemUserContextSet = false;

const BASE_API_CONFIG_KEYS: (keyof IBaseApiConfig)[] = [
  'app', 'auth', 'database', 'debug', 'email', 'env', 'network', 'thirdPartyClients'
];

/** Copies only the properties from obj that are in the specified interface. Ignores any extended properties. */
function copyOnlySpecifiedConfigProperties<T extends I, I extends object>(
  obj: T,
  allowedKeys: (keyof I)[]
): I {
  const result = {} as I;
  allowedKeys.forEach((key) => {
    if (key in obj) {
      (result as Record<string, unknown>)[key as string] = obj[key as keyof T];
    }
  });
  return result;
}

export function setBaseApiConfig(theConfig: IBaseApiConfig) {
  if (!isConfigSet) {
    config = copyOnlySpecifiedConfigProperties(theConfig, BASE_API_CONFIG_KEYS);
    isConfigSet = true;
  } else if (config.env !== 'test') {
    console.warn('BaseApiConfig data has already been set. Ignoring subsequent calls to setBaseApiConfig.');
  }
}

export async function initSystemUserContext(database: IDatabase) {
  if (!isConfigSet) {
    throw new Error('BaseApiConfig has not been set. Call setBaseApiConfig first.');
  }

  if (!isSystemUserContextSet) {
    // Handle computed/configured properties
    const systemEmail = config.email?.systemEmailAddress || 'system@example.com';
    let metaOrg = undefined;

    if (config.app.isMultiTenant) {
      // Import OrganizationService only when needed to avoid circular dependencies
      const { OrganizationService } = await import('../services/organization.service.js');
      const organizationService = new OrganizationService(database);
      // Fetch orgId from database
      metaOrg = await organizationService.getMetaOrg(EmptyUserContext);

      if (!metaOrg) {
        throw new Error('Meta organization not found. Please create an organization with isMetaOrg=true before starting the API.');
      }
    }

    // Initialize the SystemUserContext
    initializeSystemUserContext(systemEmail, metaOrg);
    isSystemUserContextSet = true;
  }
  else if (config.env !== 'test') {
    console.warn('SystemUserContext has already been set. Ignoring subsequent calls to initSystemUserContext.');
  }
}

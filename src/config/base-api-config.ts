import { EmptyUserContext, initializeSystemUserContext } from '@loomcore/common/models';
import { IBaseApiConfig } from '../models/index.js';
import { Database } from '../database/models/database.js';


export let config: IBaseApiConfig;
let isConfigSet = false;
let isSystemUserContextSet = false;

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

export async function initSystemUserContext(database: Database) {
  if (!isConfigSet) {
    throw new Error('BaseApiConfig has not been set. Call setBaseApiConfig first.');
  }

  if (!isSystemUserContextSet) {
    // Handle computed/configured properties
    const systemEmail = config.email.systemEmailAddress || 'system@example.com';
    let metaOrgId = undefined;
    
    if (config.app.isMultiTenant) {
      // Import OrganizationService only when needed to avoid circular dependencies
      const { OrganizationService } = await import('../services/organization.service.js');
      const organizationService = new OrganizationService(database);
      // Fetch orgId from database
      const metaOrg = await organizationService.getMetaOrg(EmptyUserContext);

      if (!metaOrg) {
        throw new Error('Meta organization not found. Please create an organization with isMetaOrg=true before starting the API.');
      }

      metaOrgId = metaOrg._id;
    }
    
    // Initialize the SystemUserContext
    initializeSystemUserContext(systemEmail, metaOrgId);
    isSystemUserContextSet = true;
  }
  else if (config.env !== 'test') {
    console.warn('SystemUserContext has already been set. Ignoring subsequent calls to initSystemUserContext.');
  }
}

import {
  type IOrganizationDomain,
  OrganizationDomainSpec,
} from '@loomcore/common/models';
import type { IDatabase } from '../databases/models/index.js';
import { CrossTenant } from '../decorators/cross-tenant.decorator.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';

@CrossTenant('Login resolves the organization from its domain before a tenant is known')
export class OrganizationDomainService extends GenericApiService<IOrganizationDomain> {
  constructor(database: IDatabase) {
    super(
      database,
      'organizationDomain',
      'organizationDomains',
      OrganizationDomainSpec,
    );
  }
}

import { IRefreshToken, refreshTokenModelSpec } from '@loomcore/common/models';
import type { IDatabase } from '../databases/models/index.js';

import { MultiTenantApiService } from './multi-tenant-api.service.js';

export class RefreshTokenService extends MultiTenantApiService<IRefreshToken> {
  constructor(database: IDatabase) {
    super(database, 'refreshTokens', 'refreshToken', refreshTokenModelSpec);
  }
}

import { IRefreshToken, refreshTokenModelSpec } from '@loomcore/common/models';
import type { IDatabase } from '../databases/models/index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';

export class RefreshTokenService extends GenericApiService<IRefreshToken> {
  constructor(database: IDatabase) {
    super(database, 'refreshToken', 'refreshTokens', refreshTokenModelSpec);
  }
}

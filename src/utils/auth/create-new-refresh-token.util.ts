import type { IRefreshToken } from '@loomcore/common/models';
import type { AppIdType } from '@loomcore/common/types';
import moment from 'moment';
import type { IDatabase } from '../../databases/models/index.js';
import { ServerError } from '../../errors/index.js';
import { createSystemContext } from '../../services/request-context.interface.js';
import { RefreshTokenService } from '../../services/refresh-token.service.js';
import { generateRefreshToken } from './generate-refresh-token.util.js';
import { getAuthConfig } from './get-auth-config.util.js';
import { getExpiresOnFromDays } from './get-expires-on-from-days.util.js';

export async function createNewRefreshToken(
  database: IDatabase,
  userId: AppIdType,
  deviceId: string,
  orgId?: AppIdType,
): Promise<IRefreshToken> {
  const authConfig = getAuthConfig();
  const expiresOn = getExpiresOnFromDays(
    authConfig.refreshTokenExpirationInDays,
  );

  const newRefreshToken: Partial<IRefreshToken> = {
    _orgId: orgId,
    token: generateRefreshToken(),
    deviceId,
    userId,
    expiresOn: expiresOn,
    // Validate runs before decode, so dates must be ISO strings at the service boundary
    created: moment().utc().toISOString() as unknown as Date,
    createdBy: userId,
  };

  const systemContext = createSystemContext();
  const refreshTokenService = new RefreshTokenService(database);
  await refreshTokenService.deleteMany(systemContext, {
    filters: { deviceId: { eq: deviceId } },
  });
  const insertResult = await refreshTokenService.create(
    systemContext,
    newRefreshToken,
  );

  if (!insertResult) {
    throw new ServerError('Failed to create refresh token');
  }
  return insertResult;
}

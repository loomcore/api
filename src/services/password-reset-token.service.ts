import crypto from 'node:crypto';
import {
  type IPasswordResetToken,
  type IUserContext,
  PasswordResetTokenSpec,
} from '@loomcore/common/models';
import type { IDatabase } from '../databases/models/index.js';
import { MultiTenantApiService } from './multi-tenant-api.service.js';
import { AppIdType } from '@loomcore/common/types';

export class PasswordResetTokenService extends MultiTenantApiService<IPasswordResetToken> {
  constructor(database: IDatabase) {
    super(
      database,
      'passwordResetTokens',
      'passwordResetToken',
      PasswordResetTokenSpec,
    );
  }

  async createPasswordResetToken(
    userContext: IUserContext,
    organizationId: AppIdType | undefined,
    email: string,
    expiresOn: number,
  ): Promise<IPasswordResetToken | null> {
    const lowerCaseEmail = email.toLowerCase();
    await this.deleteMany(userContext, {
      filters: { email: { eq: lowerCaseEmail }, _orgId: { eq: organizationId } },
    });

    const passwordResetToken: Partial<IPasswordResetToken> = {
      _orgId: organizationId,
      email: lowerCaseEmail,
      token: crypto.randomBytes(40).toString('hex'),
      expiresOn: expiresOn,
    };

    return super.create(userContext, passwordResetToken);
  }
}

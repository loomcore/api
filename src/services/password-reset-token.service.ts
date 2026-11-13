import crypto from 'node:crypto';
import {
  type IPasswordResetToken,
  PasswordResetTokenSpec,
} from '@loomcore/common/models';
import type { IDatabase } from '../databases/models/index.js';
import { GenericApiService } from './generic-api-service/generic-api.service.js';
import type { IRequestContext } from './request-context.interface.js';
import { AppIdType } from '@loomcore/common/types';

export class PasswordResetTokenService extends GenericApiService<IPasswordResetToken> {
  constructor(database: IDatabase) {
    super(
      database,
      'passwordResetToken',
      'passwordResetTokens',
      PasswordResetTokenSpec,
    );
  }

  async createPasswordResetToken(
    context: IRequestContext,
    organizationId: AppIdType | undefined,
    email: string,
    expiresOn: number,
  ): Promise<IPasswordResetToken | null> {
    const lowerCaseEmail = email.toLowerCase();
    await this.deleteMany(context, {
      filters: { email: { eq: lowerCaseEmail }, _orgId: { eq: organizationId } },
    });

    const passwordResetToken: Partial<IPasswordResetToken> = {
      _orgId: organizationId,
      email: lowerCaseEmail,
      token: crypto.randomBytes(40).toString('hex'),
      expiresOn: expiresOn,
    };

    return super.create(context, passwordResetToken);
  }
}
